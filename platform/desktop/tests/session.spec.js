const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSession } = require("../src/dispatch");

function writeExecutable(file, body) {
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
}

function patLedgerWrapper(dir, helperBody) {
  const helper = path.join(dir, "pat-ledger.js");
  const wrapper = path.join(dir, "pat-ledger");
  fs.writeFileSync(helper, helperBody);
  writeExecutable(
    wrapper,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} "$@"\n`,
  );
  return wrapper;
}

function waitFor(predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("timed out waiting"));
      }
    }, 30);
  });
}

test("failed dispatches reuse one source ref until new task", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pat-session-"));
  const log = path.join(dir, "argv.log");
  const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const patLedgerPath = patLedgerWrapper(
    dir,
    `const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");
process.exit(1);
`,
  );
  const ledgerPath = path.join(dir, "ledger");
  const workDir = path.join(dir, "work");
  fs.mkdirSync(ledgerPath);
  fs.mkdirSync(workDir);
  const session = createSession();
  const config = {
    patLedgerPath,
    ledgerPath,
    workDir,
    gitPath,
    executors: [
      {
        name: "fake",
        command: "/bin/true",
        args: [],
        timeout: 30,
        mode: "push",
        invoke: "cli",
      },
    ],
  };
  const payload = { owner: "fake", goal: "write the note", artifactName: "result.md" };
  const first = await session.dispatch(config, payload);
  const second = await session.dispatch(config, payload);
  expect(first.ok).toBe(false);
  expect(second.ok).toBe(false);
  const lines = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  function sourceRef(argv) {
    return argv[argv.indexOf("--source-ref") + 1];
  }
  expect(lines).toHaveLength(2);
  expect(sourceRef(lines[0])).toBe(sourceRef(lines[1]));
  expect(sourceRef(lines[0])).toMatch(/^desktop:/);
  expect(lines[0]).toContain("--git");
  expect(lines[0][lines[0].indexOf("--git") + 1]).toBe(gitPath);
  session.newTask();
  await session.dispatch(config, payload);
  const third = JSON.parse(fs.readFileSync(log, "utf8").trim().split("\n")[2]);
  expect(sourceRef(third)).toMatch(/^desktop:/);
  expect(sourceRef(third)).not.toBe(sourceRef(lines[0]));
});

test("dispatch rejects a work directory inside the ledger", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pat-session-"));
  const ledgerPath = path.join(dir, "ledger");
  const workDir = path.join(ledgerPath, "work");
  fs.mkdirSync(workDir, { recursive: true });
  const session = createSession();
  const result = await session.dispatch(
    {
      patLedgerPath: "/bin/true",
      ledgerPath,
      workDir,
      executors: [
        {
          name: "fake",
          command: "/bin/true",
          args: [],
          timeout: 1,
          mode: "push",
          invoke: "cli",
        },
      ],
    },
    { owner: "fake", goal: "stay out of the ledger" },
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain("账本");
  expect(result.busy).toBe(false);
});

test("select does not switch away while a task is running", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pat-session-"));
  const log = path.join(dir, "argv.log");
  const pidFile = path.join(dir, "sleeper.pid");
  const patLedgerPath = patLedgerWrapper(
    dir,
    `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args.includes("claim")) {
  const lines = fs.readFileSync(${JSON.stringify(log)}, "utf8").trim().split("\\n");
  const n = lines.filter((line) => JSON.parse(line).includes("claim")).length;
  process.stdout.write(JSON.stringify({ status: "claimed", id: "t-" + n, bucket: "claimed" }) + "\\n");
  process.exit(0);
}
if (args.includes("complete")) {
  process.stdout.write(JSON.stringify({ status: "completed", id: "t-1" }) + "\\n");
  process.exit(0);
}
process.stdout.write("ready\\n");
`,
  );
  const ledgerPath = path.join(dir, "ledger");
  const workDir = path.join(dir, "work");
  fs.mkdirSync(ledgerPath);
  fs.mkdirSync(workDir);
  const session = createSession();
  const config = {
    patLedgerPath,
    ledgerPath,
    workDir,
    gitPath: "",
    executors: [
      {
        name: "fast",
        command: "/bin/true",
        args: [],
        timeout: 30,
        mode: "push",
        invoke: "cli",
      },
      {
        name: "slow",
        command: process.execPath,
        args: [
          "-e",
          `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
        ],
        timeout: 30,
        mode: "push",
        invoke: "cli",
      },
    ],
  };
  try {
    const first = await session.dispatch(config, {
      owner: "fast",
      goal: "finish quickly",
      artifactName: "result.md",
    });
    expect(first.ok).toBe(true);
    await waitFor(() => {
      const snap = session.snapshot();
      return snap.currentTask && snap.currentTask.status === "completed" && !snap.busy;
    });
    const second = await session.dispatch(config, {
      owner: "slow",
      goal: "keep running",
      artifactName: "result.md",
    });
    expect(second.ok).toBe(true);
    await waitFor(() => {
      const snap = session.snapshot();
      return snap.busy && snap.selectedId === "t-2";
    });
    const selected = session.select("t-1");
    expect(selected.ok).toBe(true);
    expect(selected.selectedId).toBe("t-2");
  } finally {
    session.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, "utf8"));
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
});

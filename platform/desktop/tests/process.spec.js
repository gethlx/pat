const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runProcess, startProcess } = require("../src/process");

test("timeout ends the whole process group", async () => {
  const started = Date.now();
  const result = await runProcess({
    command: "/bin/sleep",
    args: ["30"],
    cwd: os.tmpdir(),
    timeout: 400,
  });
  expect(result.ok).toBe(false);
  expect(result.timedOut).toBe(true);
  expect(Date.now() - started).toBeLessThan(8000);
});

test("child environment is whitelisted and stdin is closed", async () => {
  const script = [
    "const chunks = [];",
    "process.stdin.on('data', (chunk) => chunks.push(chunk));",
    "process.stdin.on('end', () => {",
    "  process.stdout.write(JSON.stringify({",
    "    display: process.env.DISPLAY || '',",
    "    electron: process.env.ELECTRON || '',",
    "    stdinBytes: Buffer.concat(chunks).length",
    "  }));",
    "});",
  ].join("");
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", script],
    cwd: os.tmpdir(),
    timeout: 5000,
    env: { DISPLAY: ":not-forwarded", ELECTRON: "1" },
  });
  expect(result.ok).toBe(true);
  const payload = JSON.parse(result.stdout);
  expect(payload.display).toBe("");
  expect(payload.electron).toBe("");
  expect(payload.stdinBytes).toBe(0);
});

test("missing cwd is not replaced by the temp directory", async () => {
  const marker = path.join(os.tmpdir(), `pat-cwd-marker-${process.pid}-${Date.now()}`);
  const missing = path.join(os.tmpdir(), `pat-missing-cwd-${process.pid}-${Date.now()}`);
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, process.cwd())`],
    cwd: missing,
    requireCwd: true,
    timeout: 3000,
  });
  expect(result.ok).toBe(false);
  expect(result.stderr).toContain("工作目录");
  expect(fs.existsSync(marker)).toBe(false);
});

test("omitted cwd is inherited", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", "process.stdout.write(process.cwd())"],
    timeout: 3000,
  });
  expect(result.ok).toBe(true);
  expect(result.stdout).toBe(process.cwd());
});

test("a child that ignores SIGTERM still settles", async () => {
  const ready = path.join(os.tmpdir(), `pat-term-ready-${process.pid}-${Date.now()}`);
  const handle = startProcess({
    command: process.execPath,
    args: [
      "-e",
      `process.on("SIGTERM", () => {}); require("fs").writeFileSync(${JSON.stringify(ready)}, "up"); setInterval(() => {}, 1000);`,
    ],
    cwd: os.tmpdir(),
    timeout: 30_000,
  });
  const startedWait = Date.now();
  while (!fs.existsSync(ready)) {
    if (Date.now() - startedWait > 3000) {
      handle.stop();
      throw new Error("child did not start");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const started = Date.now();
  handle.stop();
  const result = await handle.done;
  const elapsed = Date.now() - started;
  fs.rmSync(ready, { force: true });
  expect(elapsed).toBeGreaterThan(500);
  expect(elapsed).toBeLessThan(4000);
  expect(result.ok).toBe(false);
});

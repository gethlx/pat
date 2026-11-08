const { test, expect } = require("@playwright/test");
const os = require("node:os");
const { runProcess } = require("../src/process");

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

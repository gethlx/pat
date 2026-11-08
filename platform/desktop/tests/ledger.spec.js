const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  launchApp,
  makeTempDir,
  writeConfig,
  completeConfig,
  designRepoRoot,
  resolvePatLedgerPath,
  makeLedgerSkeleton,
} = require("./helpers");

async function launchWithLedger(overrides = {}) {
  const dir = await makeTempDir();
  const ledgerPath = await makeLedgerSkeleton(dir);
  const workDir = path.join(dir, "work");
  await fs.mkdir(workDir, { recursive: true });
  const filled = {
    ...completeConfig(dir),
    ledgerPath,
    patLedgerPath: resolvePatLedgerPath(),
    workDir,
    ...overrides,
  };
  const { configPath } = await writeConfig(dir, filled);
  const app = await launchApp({ configPath });
  return { app, dir, ledgerPath, workDir };
}

test("ready succeeds against a temporary ledger skeleton", async () => {
  const { app } = await launchWithLedger();
  try {
    const window = await app.firstWindow();
    await expect(window.locator("#view-workbench")).toBeVisible();
    await expect(window.locator("#engine-status")).toHaveText("ready");
  } finally {
    await app.close();
  }
});

test("ledger path inside the design repo fails and the window shows why", async () => {
  const { app } = await launchWithLedger({ ledgerPath: designRepoRoot() });
  try {
    const window = await app.firstWindow();
    await expect(window.locator("#view-workbench")).toBeVisible();
    await expect(window.locator("#engine-status")).toContainText("两仓不得混用");
  } finally {
    await app.close();
  }
});

test("missing pat-ledger path shows an engine error and creates no checkout", async () => {
  const dir = await makeTempDir();
  const filled = { ...completeConfig(dir), patLedgerPath: "" };
  const { configPath } = await writeConfig(dir, filled);
  const app = await launchApp({ configPath });
  try {
    const window = await app.firstWindow();
    await expect(window.locator("#view-settings")).toBeVisible();
    await expect(window.locator("#settings-engine-status")).toContainText(
      "未配置 pat-ledger 路径",
    );
    const leftover = await fs.readdir(dir);
    expect(leftover).toEqual(["config.json"]);
  } finally {
    await app.close();
  }
});

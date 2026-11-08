const { test, expect } = require("@playwright/test");
const {
  launchApp,
  makeTempDir,
  writeConfig,
  completeConfig,
} = require("./helpers");

async function launchWithOverrides(overrides) {
  const dir = await makeTempDir();
  const filled = completeConfig(dir);
  const { configPath } = await writeConfig(dir, { ...filled, ...overrides });
  const app = await launchApp({ configPath });
  return { app, dir, filled, configPath };
}

async function expectSettings(window) {
  await expect(window).toHaveTitle("PAT");
  await expect(window.locator("#view-settings")).toBeVisible();
  await expect(window.locator("#view-workbench")).toBeHidden();
}

test("missing ledger path opens settings", async () => {
  const { app } = await launchWithOverrides({ ledgerPath: "" });
  try {
    await expectSettings(await app.firstWindow());
  } finally {
    await app.close();
  }
});

test("missing pat-ledger path opens settings", async () => {
  const { app } = await launchWithOverrides({ patLedgerPath: "" });
  try {
    await expectSettings(await app.firstWindow());
  } finally {
    await app.close();
  }
});

test("missing work directory opens settings", async () => {
  const { app } = await launchWithOverrides({ workDir: "" });
  try {
    await expectSettings(await app.firstWindow());
  } finally {
    await app.close();
  }
});

test("missing executor opens settings", async () => {
  const { app } = await launchWithOverrides({ executors: [] });
  try {
    await expectSettings(await app.firstWindow());
  } finally {
    await app.close();
  }
});

test("complete config opens workbench and settings stay in the same window", async () => {
  const dir = await makeTempDir();
  const filled = completeConfig(dir);
  const { configPath } = await writeConfig(dir, filled);
  const app = await launchApp({ configPath });
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("PAT");
    await expect(window.locator("#view-workbench")).toBeVisible();
    await expect(window.locator("#view-settings")).toBeHidden();
    expect(app.windows()).toHaveLength(1);

    await window.getByRole("button", { name: "设置" }).click();

    await expect(window.locator("#view-settings")).toBeVisible();
    await expect(window.locator("#view-workbench")).toBeHidden();
    await expect(window).toHaveTitle("PAT");
    expect(app.windows()).toHaveLength(1);
    await expect(window.locator("#ledgerPath")).toHaveValue(filled.ledgerPath);
    await expect(window.locator("#workDir")).toHaveValue(filled.workDir);
    expect(filled.ledgerPath).not.toBe(filled.workDir);
  } finally {
    await app.close();
  }
});

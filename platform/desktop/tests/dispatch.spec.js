const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  launchApp,
  makeTempDir,
  writeConfig,
  completeConfig,
  makeLedgerSkeleton,
  connectLedgerRemote,
  resolvePatLedgerPath,
  fakeExecutorConfig,
  sleeperExecutorConfig,
} = require("./helpers");

async function launchDispatchApp(executors) {
  const dir = await makeTempDir();
  const ledgerPath = await makeLedgerSkeleton(dir);
  connectLedgerRemote(ledgerPath);
  const workDir = path.join(dir, "work");
  await fs.mkdir(workDir, { recursive: true });
  const filled = {
    ...completeConfig(dir),
    ledgerPath,
    patLedgerPath: resolvePatLedgerPath(),
    workDir,
    executors,
  };
  const { configPath } = await writeConfig(dir, filled);
  const app = await launchApp({ configPath });
  return { app, dir, ledgerPath, workDir };
}

test("selecting an agent dispatches through the ledger and resets the form", async () => {
  const { app } = await launchDispatchApp([fakeExecutorConfig()]);
  try {
    const window = await app.firstWindow();
    await expect(window.locator("#view-workbench")).toBeVisible();
    const select = window.locator("#agent-select");
    await expect(select).toHaveValue("");
    await expect(select.locator("option:checked")).toHaveText("请选择 Agent");

    await select.selectOption("fake");
    await window.locator("#task-text").fill("write the agreed result");
    await window.locator("#dispatch-task").click();

    await expect(window.locator("#current-task-status")).toHaveText("已完成", {
      timeout: 30_000,
    });
    await expect(select).toHaveValue("");
    await expect(window.locator("#task-text")).toHaveValue("");
    await expect(window.getByRole("button", { name: "打开产物" })).toBeVisible();
    await expect(window.getByRole("button", { name: "打开工作目录" })).toBeVisible();
    await expect(window.locator("#artifact-path")).not.toHaveText("");
    await expect(window.locator("#workdir-path")).not.toHaveText("");
  } finally {
    await app.close();
  }
});

test("an in-progress task disables a second dispatch", async () => {
  const { app } = await launchDispatchApp([sleeperExecutorConfig()]);
  try {
    const window = await app.firstWindow();
    await window.locator("#view-workbench").waitFor();
    await window.locator("#agent-select").selectOption("slow");
    await window.locator("#task-text").fill("stay running");
    await window.locator("#dispatch-task").click();

    await expect(window.locator("#current-task-status")).toHaveText("进行中", {
      timeout: 30_000,
    });
    await expect(window.locator("#dispatch-task")).toBeDisabled();
    await expect(window.locator("#recent-task-list button")).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test("stop ends the process group and keeps output for review", async () => {
  const { app } = await launchDispatchApp([sleeperExecutorConfig()]);
  try {
    const window = await app.firstWindow();
    await window.locator("#view-workbench").waitFor();
    await window.locator("#agent-select").selectOption("slow");
    await window.locator("#task-text").fill("stop me");
    await window.locator("#dispatch-task").click();

    await expect(window.locator("#current-task-status")).toHaveText("进行中", {
      timeout: 30_000,
    });
    await expect(window.locator("#current-task-output")).toContainText("started", {
      timeout: 30_000,
    });
    await window.getByRole("button", { name: "停止" }).click();
    await expect(window.locator("#current-task-status")).toHaveText("待核对", {
      timeout: 30_000,
    });
    await expect(window.locator("#current-task-output")).toContainText("started");
    await expect(window.locator("#dispatch-task")).toBeEnabled();
    await expect(window.getByRole("button", { name: "停止" })).toBeHidden();
  } finally {
    await app.close();
  }
});

test("release then redispatch reuses the original task", async () => {
  const { app } = await launchDispatchApp([sleeperExecutorConfig()]);
  try {
    const window = await app.firstWindow();
    await window.locator("#view-workbench").waitFor();
    await window.locator("#agent-select").selectOption("slow");
    await window.locator("#task-text").fill("reuse this source");
    await window.locator("#dispatch-task").click();

    await expect(window.locator("#current-task-status")).toHaveText("进行中", {
      timeout: 30_000,
    });
    const taskId = (await window.locator("#current-task-id").innerText()).trim();
    expect(taskId).not.toBe("");

    await window.getByRole("button", { name: "停止" }).click();
    await expect(window.locator("#current-task-status")).toHaveText("待核对", {
      timeout: 30_000,
    });
    await window.getByRole("button", { name: "放回待领取" }).click();
    await expect(window.locator("#current-task-status")).toHaveText("待领取", {
      timeout: 30_000,
    });
    await expect(window.getByRole("button", { name: "重派" })).toBeVisible();
    await expect(window.locator("#task-form").getByRole("button", { name: "重派" })).toHaveCount(0);

    await window.getByRole("button", { name: "重派" }).click();
    await expect(window.locator("#current-task-status")).toHaveText("进行中", {
      timeout: 30_000,
    });
    await expect(window.locator("#current-task-id")).toHaveText(taskId);
  } finally {
    await app.close();
  }
});

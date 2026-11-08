const { test, expect } = require("@playwright/test");
const {
  launchApp,
  makeTempDir,
  writeConfig,
  rosterConfig,
} = require("./helpers");

const EMPTY_HINT = "还没有任务。选一个 Agent，写下任务后点派活。";

async function launchRosterApp() {
  const dir = await makeTempDir();
  const filled = rosterConfig(dir);
  const { configPath } = await writeConfig(dir, filled);
  const app = await launchApp({ configPath });
  return { app, filled };
}

test("workbench roster has no default agent and pending option is disabled", async () => {
  const { app } = await launchRosterApp();
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("PAT");
    await expect(window.locator("#view-workbench")).toBeVisible();

    const select = window.locator("#agent-select");
    await expect(select).toHaveValue("");
    await expect(select.locator("option:checked")).toHaveText("请选择 Agent");

    const connected = select.locator("option", { hasText: /^alpha$/ });
    await expect(connected).toHaveCount(1);
    await expect(connected).toBeEnabled();

    const pending = select.locator("option", { hasText: "待接入" });
    await expect(pending).toHaveText("beta（待接入）");
    await expect(pending).toBeDisabled();

    await expect(window.locator("#recent-tasks-empty")).toHaveText(EMPTY_HINT);
    await expect(window.locator("#current-task-empty")).toHaveText(EMPTY_HINT);
  } finally {
    await app.close();
  }
});

test("new task clears the form and returns the agent dropdown to the placeholder", async () => {
  const { app } = await launchRosterApp();
  try {
    const window = await app.firstWindow();
    const select = window.locator("#agent-select");
    await window.locator("#view-workbench").waitFor();
    await select.selectOption("alpha");
    await window.locator("#task-text").fill("写一份说明");
    await window.locator("#artifact-name").fill("notes.md");

    await window.getByRole("button", { name: "新建任务" }).click();

    await expect(select).toHaveValue("");
    await expect(select.locator("option:checked")).toHaveText("请选择 Agent");
    await expect(window.locator("#task-text")).toHaveValue("");
    await expect(window.locator("#artifact-name")).toHaveValue("");
  } finally {
    await app.close();
  }
});

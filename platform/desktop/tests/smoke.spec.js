const { test, expect } = require("@playwright/test");
const { launchApp } = require("./helpers");

test("window title is PAT", async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("PAT");
  } finally {
    await app.close();
  }
});

test("renderer has no nodeIntegration and exposes limited IPC", async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("PAT");

    const requireType = await window.evaluate(() => typeof window.require);
    const processType = await window.evaluate(() => typeof window.process);
    const ipcType = await window.evaluate(() => typeof window.pat?.getAppTitle);
    const titleFromIpc = await window.evaluate(() => window.pat.getAppTitle());

    expect(requireType).toBe("undefined");
    expect(processType).toBe("undefined");
    expect(ipcType).toBe("function");
    expect(titleFromIpc).toBe("PAT");
  } finally {
    await app.close();
  }
});

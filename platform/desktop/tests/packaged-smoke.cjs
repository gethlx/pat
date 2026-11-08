const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron, expect } = require("@playwright/test");

async function checkPackage(bundle) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pat-package-"));
  const app = await _electron.launch({
    executablePath: path.join(bundle, "Contents", "MacOS", "Electron"),
    args: ["--config", path.join(dir, "config.json")],
  });
  try {
    const window = await app.firstWindow();
    await expect(window.locator("#view-settings")).toBeVisible();
    const resources = path.join(await fs.realpath(bundle), "Contents", "Resources");
    await expect(window.locator("#patLedgerPath")).toHaveValue(
      path.join(resources, "pat-ledger", "pat-ledger"),
    );
    await expect(window.locator("#gitPath")).toHaveValue("/usr/bin/git");
  } finally {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

checkPackage(process.argv[2]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

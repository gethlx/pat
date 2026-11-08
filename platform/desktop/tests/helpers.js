const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const appRoot = path.join(__dirname, "..");
const electronBinary = require("electron");

function emptyConfig() {
  return {
    ledgerPath: "",
    patLedgerPath: "",
    workDir: "",
    gitPath: "",
    gitUserName: "",
    gitUserEmail: "",
    executors: [],
  };
}

function completeConfig(dir) {
  return {
    ledgerPath: path.join(dir, "ledger"),
    patLedgerPath: path.join(dir, "bin", "pat-ledger"),
    workDir: path.join(dir, "work"),
    gitPath: path.join(dir, "bin", "git"),
    gitUserName: "PAT Test",
    gitUserEmail: "pat-test@example.com",
    executors: [
      {
        name: "fake",
        command: path.join(dir, "bin", "executor"),
        args: [],
        timeout: 60,
        mode: "push",
        invoke: "cli",
      },
    ],
  };
}

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "pat-desktop-"));
}

async function writeConfig(dir, overrides) {
  const config = { ...emptyConfig(), ...overrides };
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { configPath, config };
}

function launchApp(options = {}) {
  const args = [appRoot, "--no-sandbox", "--disable-gpu"];
  if (options.configPath) {
    args.push("--config", options.configPath);
  }
  return electron.launch({
    executablePath: electronBinary,
    args,
  });
}

module.exports = {
  launchApp,
  makeTempDir,
  writeConfig,
  completeConfig,
  emptyConfig,
};

const { _electron: electron } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
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

function rosterConfig(dir) {
  const filled = completeConfig(dir);
  return {
    ...filled,
    executors: [
      {
        ...filled.executors[0],
        name: "alpha",
      },
      {
        name: "beta",
        command: "",
        args: [],
        timeout: 0,
        mode: "push",
        invoke: "",
      },
    ],
  };
}

const SKELETON_DIRS = [
  "events",
  "proposals",
  "confirmed",
  "index",
  "artifacts",
  "tasks/inbox",
  "tasks/claimed",
  "tasks/done",
];

function designRepoRoot() {
  return path.join(__dirname, "..", "..", "..");
}

function ledgerProjectDir() {
  return path.join(designRepoRoot(), "platform", "ledger");
}

let cachedPatLedgerPath = "";

function resolvePatLedgerPath() {
  if (cachedPatLedgerPath) {
    return cachedPatLedgerPath;
  }
  const ledgerDir = ledgerProjectDir();
  execFileSync("uv", ["sync"], { cwd: ledgerDir, stdio: "pipe" });
  const script = path.join(ledgerDir, ".venv", "bin", "pat-ledger");
  if (!fsSync.existsSync(script)) {
    throw new Error("uv sync 之后未找到 pat-ledger");
  }
  cachedPatLedgerPath = script;
  return cachedPatLedgerPath;
}

async function makeLedgerSkeleton(dir) {
  const root = path.join(dir, "ledger");
  for (const rel of SKELETON_DIRS) {
    const folder = path.join(root, rel);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, ".gitkeep"), "");
  }
  await fs.writeFile(path.join(root, ".gitignore"), ".git/pat.lock\n");
  await fs.writeFile(
    path.join(root, "README.md"),
    "# pat-memory\n\nPAT 的私密共享记忆仓：事件库 + 任务账本。\n",
  );
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, stdio: "pipe" });
  return root;
}

module.exports = {
  launchApp,
  makeTempDir,
  writeConfig,
  completeConfig,
  rosterConfig,
  emptyConfig,
  designRepoRoot,
  resolvePatLedgerPath,
  makeLedgerSkeleton,
};

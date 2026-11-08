const fs = require("node:fs");
const path = require("node:path");

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

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

function normalizeExecutor(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    name: asString(item.name),
    command: asString(item.command),
    args: Array.isArray(item.args) ? item.args.map((part) => String(part)) : [],
    timeout: asNumber(item.timeout),
    mode: asString(item.mode),
    invoke: asString(item.invoke),
  };
}

function normalizeConfig(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    ledgerPath: asString(data.ledgerPath),
    patLedgerPath: asString(data.patLedgerPath),
    workDir: asString(data.workDir),
    gitPath: asString(data.gitPath),
    gitUserName: asString(data.gitUserName),
    gitUserEmail: asString(data.gitUserEmail),
    executors: Array.isArray(data.executors)
      ? data.executors.map(normalizeExecutor)
      : [],
  };
}

function isLaunchableExecutor(executor) {
  return Boolean(executor.name.trim() && path.isAbsolute(executor.command.trim())
    && (!executor.mode || executor.mode === "push"));
}

function isConfigComplete(config) {
  return Boolean(
    config.ledgerPath.trim() &&
      config.patLedgerPath.trim() &&
      config.workDir.trim() &&
      config.executors.some(isLaunchableExecutor),
  );
}

function readConfigFlag(argv) {
  const flag = "--config";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) {
      return argv[i + 1];
    }
    if (argv[i].startsWith(`${flag}=`)) {
      return argv[i].slice(flag.length + 1);
    }
  }
  return null;
}

function loadConfig(configPath) {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch {
    return emptyConfig();
  }
}

function saveConfig(configPath, config) {
  const normalized = normalizeConfig(config);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

module.exports = {
  emptyConfig,
  normalizeConfig,
  isLaunchableExecutor,
  isConfigComplete,
  readConfigFlag,
  loadConfig,
  saveConfig,
};

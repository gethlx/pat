const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  loadConfig,
  saveConfig,
  normalizeConfig,
  isConfigComplete,
  readConfigFlag,
} = require("./config");
const { ready } = require("./ledger");
const { createSession } = require("./dispatch");

const APP_TITLE = "PAT";

let configPath = "";
let currentConfig = normalizeConfig({});
let currentView = "settings";
let session = createSession();
let readiness = null;
let historyError = "";
let updatingConfig = false;

if (process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch("no-sandbox");
}

function resolveConfigPath() {
  const flagged = readConfigFlag(process.argv);
  if (flagged) {
    return path.resolve(flagged);
  }
  return path.join(app.getPath("userData"), "config.json");
}

function getState() {
  return {
    title: APP_TITLE,
    view: currentView,
    config: currentConfig,
    complete: isConfigComplete(currentConfig),
    historyError,
    ...session.snapshot(),
  };
}

function notifyRenderer() {
  const state = getState();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pat:state", state);
    }
  }
}

function probeReady() {
  return ready({
    patLedgerPath: currentConfig.patLedgerPath,
    ledgerPath: currentConfig.ledgerPath,
    cwd: currentConfig.workDir,
    gitPath: currentConfig.gitPath,
  });
}

function ledgerDefaults(config) {
  const bundled = path.join(process.resourcesPath, "pat-ledger", "pat-ledger");
  return fs.existsSync(bundled)
    ? { ...config, patLedgerPath: bundled, gitPath: config.gitPath || "/usr/bin/git" }
    : config;
}

async function loadWorkbench() {
  currentView = isConfigComplete(currentConfig) ? "workbench" : "settings";
  readiness = await probeReady();
  historyError = readiness.ok && currentView === "workbench"
    ? await session.restore(currentConfig)
    : "";
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 580,
    minHeight: 480,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(APP_TITLE);
  });

  win.setTitle(APP_TITLE);
  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("pat:getAppTitle", () => APP_TITLE);

ipcMain.handle("pat:getState", () => getState());

ipcMain.handle("pat:saveConfig", async (_event, raw) => {
  if (updatingConfig || session.snapshot().busy) return getState();
  updatingConfig = true;
  try {
    currentConfig = ledgerDefaults(saveConfig(configPath, raw));
    session = createSession();
    await loadWorkbench();
    return getState();
  } finally {
    updatingConfig = false;
  }
});

ipcMain.handle("pat:chooseDirectory", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return picked.filePaths[0] || "";
});

ipcMain.handle("pat:openTarget", async (_event, kind) => {
  if (kind !== "artifact" && kind !== "workdir") return "未知的打开操作。";
  const target = session.openTarget(currentConfig, kind);
  return target ? shell.openPath(target) : "文件或目录缺失，或产物校验未通过。";
});

ipcMain.handle("pat:showSettings", () => {
  currentView = "settings";
  return getState();
});

ipcMain.handle("pat:showWorkbench", () => {
  if (isConfigComplete(currentConfig)) {
    currentView = "workbench";
  }
  return getState();
});

ipcMain.handle("pat:probeReady", () => readiness);

ipcMain.handle("pat:dispatch", (_event, payload) => {
  if (updatingConfig || !readiness?.ok || historyError) {
    return { ...session.snapshot(), ok: false, error: historyError || "请先核对账本设置。" };
  }
  return session.dispatch(currentConfig, payload, notifyRenderer);
});

ipcMain.handle("pat:stop", () => session.stop());

ipcMain.handle("pat:release", () => session.release(currentConfig));

ipcMain.handle("pat:redispatch", () =>
  session.redispatch(currentConfig, notifyRenderer),
);

ipcMain.handle("pat:selectTask", (_event, id) => session.select(id));

ipcMain.handle("pat:newTask", () => session.newTask());

ipcMain.handle("pat:confirmTask", () => session.confirm(currentConfig));

ipcMain.handle("pat:continueSync", () => session.continueSync(currentConfig));

app.whenReady().then(async () => {
  configPath = resolveConfigPath();
  currentConfig = ledgerDefaults(loadConfig(configPath));
  await loadWorkbench();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  session.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

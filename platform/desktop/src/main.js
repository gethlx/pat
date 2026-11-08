const { app, BrowserWindow, ipcMain } = require("electron");
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
const session = createSession();

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

function applyLoadedConfig() {
  currentConfig = loadConfig(configPath);
  currentView = isConfigComplete(currentConfig) ? "workbench" : "settings";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
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

ipcMain.handle("pat:saveConfig", (_event, raw) => {
  currentConfig = saveConfig(configPath, raw);
  currentView = isConfigComplete(currentConfig) ? "workbench" : "settings";
  return getState();
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

ipcMain.handle("pat:probeReady", () => probeReady());

ipcMain.handle("pat:dispatch", (_event, payload) =>
  session.dispatch(currentConfig, payload, notifyRenderer),
);

ipcMain.handle("pat:stop", () => session.stop());

ipcMain.handle("pat:release", () => session.release(currentConfig));

ipcMain.handle("pat:redispatch", () =>
  session.redispatch(currentConfig, notifyRenderer),
);

ipcMain.handle("pat:selectTask", (_event, id) => session.select(id));

ipcMain.handle("pat:newTask", () => session.newTask());

ipcMain.handle("pat:confirmTask", () => session.confirm(currentConfig));

ipcMain.handle("pat:continueSync", () => session.continueSync(currentConfig));

app.whenReady().then(() => {
  configPath = resolveConfigPath();
  applyLoadedConfig();
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

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const APP_TITLE = "PAT";

if (process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch("no-sandbox");
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');

let win = null;
let reportsWin = null;

function createWindow() {
  win = new BrowserWindow({
    width: 384,
    height: 660,
    resizable: false,
    fullscreenable: true, // resizable:false otherwise blocks fullscreen on macOS
    backgroundColor: '#0c1410',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { win = null; });
}

function createReportsWindow() {
  if (reportsWin && !reportsWin.isDestroyed()) {
    if (reportsWin.isMinimized()) reportsWin.restore();
    reportsWin.show();
    reportsWin.focus();
    return;
  }
  reportsWin = new BrowserWindow({
    width: 940,
    height: 700,
    minWidth: 620,
    minHeight: 520,
    backgroundColor: '#0c1410',
    title: 'Reports',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  reportsWin.loadFile(path.join(__dirname, 'src', 'reports.html'));
  reportsWin.on('closed', () => { reportsWin = null; });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      path.join(__dirname, 'build', 'icon.png')
    );
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createWindow();
  app.on('activate', () => {
    if (!win || win.isDestroyed()) createWindow();
    else { win.show(); win.focus(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('session-ended', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.setAlwaysOnTop(true);
  setTimeout(() => {
    if (win) win.setAlwaysOnTop(false);
  }, 1000);
});

ipcMain.on('open-reports', () => createReportsWindow());

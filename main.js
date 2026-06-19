const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 384,
    height: 660,
    resizable: false,
    backgroundColor: '#0c1410',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

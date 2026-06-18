const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoro', {
  sessionEnded: () => ipcRenderer.send('session-ended'),
});

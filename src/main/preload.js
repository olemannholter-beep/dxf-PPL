const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  saveFileContent: (filePath, content) => ipcRenderer.invoke('fs:saveFile', filePath, content),
  readFileContent: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItem', filePath),
  getAppVersion: () => ipcRenderer.invoke('app:version')
});

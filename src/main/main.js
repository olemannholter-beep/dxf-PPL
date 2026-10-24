const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'DXF Studio - 2D CAD & Sheet Metal',
    backgroundColor: '#1b1d22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.NODE_ENV !== 'production';
  const devServerUrl = 'http://localhost:5173';
  const prodFilePath = path.join(__dirname, '../../dist/renderer/index.html');

  if (isDev) {
    let retries = 0;
    const maxRetries = 20;
    const connectDevServer = () => {
      mainWindow.loadURL(devServerUrl).catch((err) => {
        retries++;
        if (retries < maxRetries) {
          setTimeout(connectDevServer, 300);
        } else if (fs.existsSync(prodFilePath)) {
          console.warn('[main] Vite dev server unreachable, falling back to compiled dist:', prodFilePath);
          mainWindow.loadFile(prodFilePath);
        } else {
          console.error('[main] Failed to connect to dev server and no compiled dist found:', err);
        }
      });
    };
    connectDevServer();
  } else {
    mainWindow.loadFile(prodFilePath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for native file dialogs and I/O
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open DXF Drawing',
    properties: ['openFile'],
    filters: [
      { name: 'DXF Files (*.dxf)', extensions: ['dxf'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  return { filePath, content, fileName: path.basename(filePath) };
});

ipcMain.handle('dialog:saveFile', async (event, defaultName = 'drawing.dxf') => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export DXF File',
    defaultPath: defaultName,
    filters: [
      { name: 'AutoCAD R12 DXF (*.dxf)', extensions: ['dxf'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('fs:saveFile', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('shell:showItem', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

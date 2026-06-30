const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    titleBarStyle: 'hidden',

    show: false,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                 contextIsolation: true,
                                 nodeIntegration: false,
                                 sandbox: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () =>
  mainWindow.webContents.send('window:maximized', true)
  );

  mainWindow.on('unmaximize', () =>
  mainWindow.webContents.send('window:maximized', false)
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize());

ipcMain.on('window:maximize-toggle', () => {
  if (!mainWindow) return;

  if (mainWindow.isMaximized())
    mainWindow.unmaximize();
  else
    mainWindow.maximize();
});

ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.handle('window:is-maximized', () =>
mainWindow?.isMaximized() ?? false
);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0)
    createWindow();
});

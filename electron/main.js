const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initializeDatabase } = require('./db');
const { runCapture } = require('./capture');
const { addKeyword, listKeywords, removeKeyword, updateKeyword } = require('./keywords');
const { getSettings, setSettings } = require('./settings');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  win.loadURL(startUrl);
}

ipcMain.handle('settings:get', () => {
  return getSettings();
});

ipcMain.handle('settings:set', (_event, update) => {
  if (!update || typeof update !== 'object') {
    throw new Error('settings:set expects an object payload');
  }
  return setSettings(update);
});

ipcMain.handle('keywords:list', () => {
  return listKeywords();
});

ipcMain.handle('keywords:add', (_event, value) => {
  return addKeyword(value);
});

ipcMain.handle('keywords:update', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('keywords:update expects an object payload');
  }
  return updateKeyword(payload.id, payload.value, payload.isEnabled);
});

ipcMain.handle('keywords:remove', (_event, id) => {
  return removeKeyword(id);
});

ipcMain.handle('capture:run', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('capture:run expects an object payload');
  }
  return runCapture(payload.keywordId, payload.limit);
});

app.whenReady().then(() => {
  initializeDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

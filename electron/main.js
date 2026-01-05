const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initializeDatabase } = require('./db');
const { runCapture } = require('./capture');
const {
  cancelTask,
  enqueueBatch,
  enqueueTask,
  getQueueStats,
  pauseQueue,
  resumeQueue,
} = require('./generationQueue');
const { listTopics, updateTopicStatus } = require('./topicService');
const { exportMetricsCsv, getMetricsSummary, recordMetric } = require('./metricsService');
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

ipcMain.handle('generation:enqueue', (_event, payload) => {
  if (!payload) {
    throw new Error('generation:enqueue expects a payload');
  }
  if (Array.isArray(payload.tasks)) {
    return enqueueBatch(payload.tasks);
  }
  return enqueueTask(payload);
});

ipcMain.handle('generation:pause', () => {
  return pauseQueue();
});

ipcMain.handle('generation:resume', () => {
  return resumeQueue();
});

ipcMain.handle('generation:cancel', (_event, taskId) => {
  return cancelTask(taskId);
});

ipcMain.handle('generation:stats', () => {
  return getQueueStats();
});

ipcMain.handle('topics:list', () => {
  return listTopics();
});

ipcMain.handle('topics:updateStatus', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('topics:updateStatus expects an object payload');
  }
  return updateTopicStatus(payload.id, payload.status);
});

ipcMain.handle('metrics:record', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('metrics:record expects an object payload');
  }
  return recordMetric(payload);
});

ipcMain.handle('metrics:summary', (_event, payload) => {
  const windowDays = payload?.windowDays ? Number(payload.windowDays) : 7;
  return getMetricsSummary(windowDays);
});

ipcMain.handle('metrics:export', (_event, payload) => {
  const windowDays = payload?.windowDays ? Number(payload.windowDays) : 7;
  return exportMetricsCsv(windowDays);
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

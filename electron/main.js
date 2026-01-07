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
const { publishTopic, rollbackTopic } = require('./workflowService');
const { exportMetricsCsv, getMetricsSummary, recordMetric } = require('./metricsService');
const { getConfig, setConfig } = require('./config');
const logger = require('./logger');
const { addKeyword, listKeywords, removeKeyword, updateKeyword } = require('./keywords');
const { getSettings, setSettings } = require('./settings');
const { addCompetitor, listCompetitors, removeCompetitor } = require('./competitorService');
const { createCreative, listCreatives, updateCreative } = require('./creativeService');
const { getInsights, refreshInsights } = require('./insightService');
const { enqueueInteraction, listInteractions } = require('./interactionService');
const { enqueuePublish, listPublishes } = require('./publishService');
const { createTheme, listThemes, removeTheme, setThemeStatus, updateTheme } = require('./themeService');

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

ipcMain.handle('themes:list', () => {
  return listThemes();
});

ipcMain.handle('themes:create', (_event, payload) => {
  return createTheme(payload);
});

ipcMain.handle('themes:update', (_event, payload) => {
  return updateTheme(payload);
});

ipcMain.handle('themes:remove', (_event, payload) => {
  return removeTheme(payload?.id || payload);
});

ipcMain.handle('themes:setStatus', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('themes:setStatus expects an object payload');
  }
  return setThemeStatus(payload.id, payload.status);
});

ipcMain.handle('competitors:list', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('competitors:list expects an object payload');
  }
  return listCompetitors(payload.themeId);
});

ipcMain.handle('competitors:add', (_event, payload) => {
  return addCompetitor(payload);
});

ipcMain.handle('competitors:remove', (_event, payload) => {
  return removeCompetitor(payload?.id || payload);
});

ipcMain.handle('insights:get', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('insights:get expects an object payload');
  }
  return getInsights(payload.themeId);
});

ipcMain.handle('insights:refresh', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('insights:refresh expects an object payload');
  }
  return refreshInsights(payload.themeId);
});

ipcMain.handle('creatives:list', (_event, payload) => {
  return listCreatives(payload?.themeId);
});

ipcMain.handle('creatives:create', (_event, payload) => {
  return createCreative(payload);
});

ipcMain.handle('creatives:update', (_event, payload) => {
  return updateCreative(payload);
});

ipcMain.handle('publish:list', (_event, payload) => {
  return listPublishes(payload?.themeId);
});

ipcMain.handle('publish:enqueue', (_event, payload) => {
  return enqueuePublish(payload);
});

ipcMain.handle('interactions:list', (_event, payload) => {
  return listInteractions(payload?.publishRecordId);
});

ipcMain.handle('interactions:enqueue', (_event, payload) => {
  return enqueueInteraction(payload);
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

ipcMain.handle('config:get', () => {
  return getConfig();
});

ipcMain.handle('config:set', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('config:set expects an object payload');
  }
  return setConfig(payload);
});

ipcMain.handle('workflow:publishTopic', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('workflow:publishTopic expects an object payload');
  }
  return publishTopic(payload.topicId, payload.platform);
});

ipcMain.handle('workflow:rollback', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('workflow:rollback expects an object payload');
  }
  return rollbackTopic(payload.topicId);
});

app.whenReady().then(() => {
  initializeDatabase();
  logger.info('app_ready', { config: getConfig() });
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

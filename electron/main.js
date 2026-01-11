const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setUserDataPath } = require('./server/runtime/userDataPath');
const { initializeDatabase } = require('./server/db');
const { runCapture } = require('./server/services/xhs/capture');
const {
  cancelTask,
  enqueueBatch,
  enqueueTask,
  getQueueStats,
  pauseQueue,
  resumeQueue,
} = require('./server/services/xhs/generationQueue');
const { listTopics, updateTopicStatus } = require('./server/services/xhs/topicService');
const { publishTopic, rollbackTopic } = require('./server/services/xhs/workflowService');
const { exportMetricsCsv, getMetricsSummary, recordMetric } = require('./server/services/xhs/metricsService');
const { getConfig, setConfig } = require('./server/config');
const logger = require('./server/logger');
const { addKeyword, listKeywords, removeKeyword, updateKeyword } = require('./server/services/xhs/keywords');
const { getSettings, setSettings } = require('./server/settings');
const { addCompetitor, listCompetitors, removeCompetitor } = require('./server/services/xhs/competitorService');
const { createCreative, listCreatives, updateCreative } = require('./server/services/xhs/creativeService');
const { applySuggestion, generateSuggestion, listFormAssists, saveFeedback } = require('./server/services/xhs/formAssistService');
const { getInsights, refreshInsights } = require('./server/services/xhs/insightService');
const { enqueueInteraction, listInteractions } = require('./server/services/xhs/interactionService');
const { enqueuePublish, listPublishes } = require('./server/services/xhs/publishService');
const { createTheme, listThemes, removeTheme, setThemeStatus, updateTheme } = require('./server/services/xhs/themeService');
const { login, logout, checkStatus } = require('./server/services/xhs/localService');
const {
  Scheduler,
  createJob,
  updateJob,
  deleteJob,
  getJob,
  listJobs,
  listExecutions,
  getJobByTheme,
  getJobByKeyword,
  getRateLimiter,
} = require('./server/services/scheduler');

let scheduler = null;

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

ipcMain.handle('formAssist:list', (_event, payload) => {
  return listFormAssists(payload?.themeId);
});

ipcMain.handle('formAssist:generate', (_event, payload) => {
  return generateSuggestion(payload);
});

ipcMain.handle('formAssist:apply', (_event, payload) => {
  return applySuggestion(payload);
});

ipcMain.handle('formAssist:feedback', (_event, payload) => {
  return saveFeedback(payload);
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

ipcMain.handle('auth:login', (_event, options) => {
  return login(options);
});

ipcMain.handle('auth:logout', () => {
  return logout();
});

ipcMain.handle('auth:checkStatus', () => {
  return checkStatus();
});

// ============ 调度器 IPC Handlers ============

ipcMain.handle('scheduler:start', () => {
  if (!scheduler) scheduler = new Scheduler();
  scheduler.start();
  return { success: true };
});

ipcMain.handle('scheduler:stop', () => {
  if (scheduler) scheduler.stop();
  return { success: true };
});

ipcMain.handle('scheduler:pause', () => {
  if (scheduler) scheduler.pause();
  return { success: true };
});

ipcMain.handle('scheduler:resume', () => {
  if (scheduler) scheduler.resume();
  return { success: true };
});

ipcMain.handle('scheduler:status', () => {
  if (!scheduler) return { running: false, paused: false, queueSize: 0, activeJobs: 0, nextExecution: null };
  return scheduler.getStatus();
});

// ============ 任务管理 IPC Handlers ============

ipcMain.handle('jobs:list', (_event, payload) => {
  return listJobs(payload?.themeId);
});

ipcMain.handle('jobs:get', (_event, payload) => {
  return getJob(payload?.id || payload);
});

ipcMain.handle('jobs:create', (_event, payload) => {
  return createJob(payload);
});

ipcMain.handle('jobs:update', (_event, payload) => {
  const { id, ...updates } = payload;
  return updateJob(id, updates);
});

ipcMain.handle('jobs:delete', (_event, payload) => {
  deleteJob(payload?.id || payload);
  return { success: true };
});

ipcMain.handle('jobs:trigger', (_event, payload) => {
  if (!scheduler) scheduler = new Scheduler();
  return scheduler.triggerJob(payload?.id || payload);
});

ipcMain.handle('jobs:byTheme', (_event, payload) => {
  return getJobByTheme(payload?.themeId || payload);
});

ipcMain.handle('jobs:byKeyword', (_event, payload) => {
  return getJobByKeyword(payload?.keywordId || payload);
});

// ============ 执行历史 IPC Handlers ============

ipcMain.handle('executions:list', (_event, payload) => {
  return listExecutions(payload?.jobId, payload?.limit);
});

ipcMain.handle('executions:cancel', (_event, payload) => {
  if (!scheduler) return { success: false };
  return { success: scheduler.cancelExecution(payload?.id || payload) };
});

// ============ 速率限制 IPC Handlers ============

ipcMain.handle('rateLimit:status', () => {
  return getRateLimiter().getStatus();
});

ipcMain.handle('rateLimit:unblock', (_event, payload) => {
  getRateLimiter().unblock(payload.scope, payload.scopeId);
  return { success: true };
});

app.whenReady().then(() => {
  setUserDataPath(app.getPath('userData'));
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

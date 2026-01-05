const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getLogPath() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'app.log');
}

function writeLog(level, message, meta) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    meta,
  });
  fs.appendFileSync(getLogPath(), `${line}\n`, 'utf8');
}

module.exports = {
  getLogPath,
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta),
};

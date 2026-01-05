const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  updateChannel: 'stable',
  logLevel: 'info',
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getConfig() {
  const filePath = getConfigPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

function setConfig(update) {
  const filePath = getConfigPath();
  const next = { ...getConfig(), ...update };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  getConfig,
  getConfigPath,
  setConfig,
};

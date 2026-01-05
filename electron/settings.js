const { getDatabase } = require('./db');

function getSetting(key) {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) {
    return undefined;
  }
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return row.value;
  }
}

function setSetting(key, value) {
  const db = getDatabase();
  const payload = JSON.stringify(value);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(key, payload);
  return value;
}

function getSettings() {
  return {
    captureEnabled: getSetting('captureEnabled') ?? false,
    captureFrequencyMinutes: getSetting('captureFrequencyMinutes') ?? 60,
    captureRateLimitMs: getSetting('captureRateLimitMs') ?? 1000,
    captureRetryCount: getSetting('captureRetryCount') ?? 2,
    metricsWindowDays: getSetting('metricsWindowDays') ?? 7,
  };
}

function setSettings(update) {
  const next = { ...getSettings(), ...update };
  Object.entries(next).forEach(([key, value]) => {
    setSetting(key, value);
  });
  return next;
}

module.exports = {
  getSetting,
  getSettings,
  setSetting,
  setSettings,
};

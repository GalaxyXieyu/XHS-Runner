import { getDatabase } from './db';

export function getSetting(key: string) {
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

export function setSetting(key: string, value: any) {
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

export function getSettings() {
  return {
    captureEnabled: getSetting('captureEnabled') ?? false,
    captureFrequencyMinutes: getSetting('captureFrequencyMinutes') ?? 60,
    captureRateLimitMs: getSetting('captureRateLimitMs') ?? 1000,
    captureRetryCount: getSetting('captureRetryCount') ?? 2,
    metricsWindowDays: getSetting('metricsWindowDays') ?? 7,
    llmBaseUrl: getSetting('llmBaseUrl') ?? '',
    llmApiKey: getSetting('llmApiKey') ?? '',
    llmModel: getSetting('llmModel') ?? '',
    volcengineAccessKey: getSetting('volcengineAccessKey') ?? '',
    volcengineSecretKey: getSetting('volcengineSecretKey') ?? '',
    superbedToken: getSetting('superbedToken') ?? '',
    nanobananaEndpoint: getSetting('nanobananaEndpoint') ?? '',
    nanobananaMode: getSetting('nanobananaMode') ?? 'mock',
    nanobananaApiKey: getSetting('nanobananaApiKey') ?? '',
  };
}

export function setSettings(update: Record<string, any>) {
  const next = { ...getSettings(), ...update };
  Object.entries(next).forEach(([key, value]) => {
    setSetting(key, value);
  });
  return next;
}

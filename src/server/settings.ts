import { db, schema } from './db';
import { eq, inArray, sql } from 'drizzle-orm';

function parseSettingValue(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function getSetting(key: string): Promise<any> {
  const settings = schema.settings;
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return parseSettingValue(row.value);
}

export async function setSetting(key: string, value: any): Promise<any> {
  const settings = schema.settings;
  const payload = JSON.stringify(value);

  await db
    .insert(settings)
    .values({ key, value: payload, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: payload, updatedAt: new Date() },
    });

  return value;
}

export async function getSettings() {
  const keys = [
    'captureEnabled',
    'captureFrequencyMinutes',
    'captureRateLimitMs',
    'captureRetryCount',
    'metricsWindowDays',
    'llmBaseUrl',
    'llmApiKey',
    'llmModel',
    'volcengineAccessKey',
    'volcengineSecretKey',
    'superbedToken',
    'nanobananaEndpoint',
    'nanobananaMode',
    'nanobananaApiKey',
  ];

  const settings = schema.settings;
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys as any));

  const parsed: Record<string, any> = {};
  (rows || []).forEach((row) => {
    parsed[row.key] = parseSettingValue(row.value);
  });

  return {
    captureEnabled: parsed.captureEnabled ?? false,
    captureFrequencyMinutes: parsed.captureFrequencyMinutes ?? 60,
    captureRateLimitMs: parsed.captureRateLimitMs ?? 1000,
    captureRetryCount: parsed.captureRetryCount ?? 2,
    metricsWindowDays: parsed.metricsWindowDays ?? 7,
    llmBaseUrl: parsed.llmBaseUrl ?? '',
    llmApiKey: parsed.llmApiKey ?? '',
    llmModel: parsed.llmModel ?? '',
    volcengineAccessKey: parsed.volcengineAccessKey ?? '',
    volcengineSecretKey: parsed.volcengineSecretKey ?? '',
    superbedToken: parsed.superbedToken ?? '',
    nanobananaEndpoint: parsed.nanobananaEndpoint ?? '',
    nanobananaMode: parsed.nanobananaMode ?? 'mock',
    nanobananaApiKey: parsed.nanobananaApiKey ?? '',
  };
}

export async function setSettings(update: Record<string, any>) {
  const current = await getSettings();
  const next = { ...current, ...update };

  const settings = schema.settings;
  const now = new Date();
  const rows = Object.entries(next).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updatedAt: now,
  }));

  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: sql`excluded.value`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  return next;
}

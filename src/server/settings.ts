import { supabase } from './supabase';

export async function getSetting(key: string): Promise<any> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();

  if (!data) return undefined;

  try {
    return JSON.parse(data.value);
  } catch {
    return data.value;
  }
}

export async function setSetting(key: string, value: any): Promise<any> {
  const payload = JSON.stringify(value);
  await supabase
    .from('settings')
    .upsert({ key, value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return value;
}

export async function getSettings() {
  const keys = [
    'captureEnabled', 'captureFrequencyMinutes', 'captureRateLimitMs', 'captureRetryCount',
    'metricsWindowDays', 'llmBaseUrl', 'llmApiKey', 'llmModel',
    'volcengineAccessKey', 'volcengineSecretKey', 'superbedToken',
    'nanobananaEndpoint', 'nanobananaMode', 'nanobananaApiKey'
  ];

  const { data } = await supabase.from('settings').select('key, value').in('key', keys);

  const settings: Record<string, any> = {};
  (data || []).forEach((row: any) => {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  });

  return {
    captureEnabled: settings.captureEnabled ?? false,
    captureFrequencyMinutes: settings.captureFrequencyMinutes ?? 60,
    captureRateLimitMs: settings.captureRateLimitMs ?? 1000,
    captureRetryCount: settings.captureRetryCount ?? 2,
    metricsWindowDays: settings.metricsWindowDays ?? 7,
    llmBaseUrl: settings.llmBaseUrl ?? '',
    llmApiKey: settings.llmApiKey ?? '',
    llmModel: settings.llmModel ?? '',
    volcengineAccessKey: settings.volcengineAccessKey ?? '',
    volcengineSecretKey: settings.volcengineSecretKey ?? '',
    superbedToken: settings.superbedToken ?? '',
    nanobananaEndpoint: settings.nanobananaEndpoint ?? '',
    nanobananaMode: settings.nanobananaMode ?? 'mock',
    nanobananaApiKey: settings.nanobananaApiKey ?? '',
  };
}

export async function setSettings(update: Record<string, any>) {
  const current = await getSettings();
  const next = { ...current, ...update };

  const rows = Object.entries(next).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updated_at: new Date().toISOString()
  }));

  await supabase.from('settings').upsert(rows, { onConflict: 'key' });
  return next;
}

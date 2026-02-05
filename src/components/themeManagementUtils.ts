import type { Theme } from '../App';
import { CACHE_VERSION } from '@/utils/cacheVersion';

export type ThemeFormData = {
  name: string;
  description: string;
  keywords: string;
  competitors: string;
  status: Theme['status'];
  goal: string;
  persona: string;
  tone: string;
  contentTypes: string;
  forbiddenTags: string;
  promptProfileId: string;
  dailyOutputCount: string;
  minQualityScore: string;
  scheduleEnabled: boolean;
  schedulePreset: 'interval' | 'daily' | 'weekly' | 'cron';
  scheduleType: 'interval' | 'cron';
  intervalMinutes: string;
  cronExpression: string;
  scheduleTime: string;
  scheduleWeekday: string;
  captureLimit: string;
  schedulePriority: string;
  scheduleJobId: string;
};

const PROMPT_PROFILES_TTL_MS = 5 * 60 * 1000;
let promptProfilesCache: { version: string; data: any[]; fetchedAt: number } | null = null;

export const readPromptProfilesCache = () => {
  if (!promptProfilesCache) return null;
  if (promptProfilesCache.version !== CACHE_VERSION) {
    promptProfilesCache = null;
    return null;
  }
  if (Date.now() - promptProfilesCache.fetchedAt > PROMPT_PROFILES_TTL_MS) {
    promptProfilesCache = null;
    return null;
  }
  return promptProfilesCache.data;
};

export const writePromptProfilesCache = (data: any[]) => {
  promptProfilesCache = { version: CACHE_VERSION, data, fetchedAt: Date.now() };
};

export const createEmptyFormData = (): ThemeFormData => ({
  name: '',
  description: '',
  keywords: '',
  competitors: '',
  status: 'active',
  goal: '',
  persona: '',
  tone: '',
  contentTypes: '',
  forbiddenTags: '',
  promptProfileId: '',
  dailyOutputCount: '',
  minQualityScore: '',
  scheduleEnabled: false,
  schedulePreset: 'interval',
  scheduleType: 'interval',
  intervalMinutes: '30',
  cronExpression: '*/30 * * * *',
  scheduleTime: '09:00',
  scheduleWeekday: '1',
  captureLimit: '50',
  schedulePriority: '5',
  scheduleJobId: '',
});

export async function apiCall(method: string, url: string, body?: any) {
  if (window.themes) {
    if (method === 'POST' && url === '/api/themes') return window.themes.create(body);
    if (method === 'PUT') return window.themes.update(body);
    if (method === 'DELETE') return window.themes.remove(body);
    if (method === 'PATCH') return window.themes.setStatus(body);
  }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function jobCall(method: string, payload?: any) {
  if ((window as any).jobs) {
    if (method === 'create') return (window as any).jobs.create(payload);
    if (method === 'update') return (window as any).jobs.update(payload);
    if (method === 'byTheme') return (window as any).jobs.byTheme(payload);
  }
  if (method === 'create') {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || '创建定时任务失败');
    return res.json();
  }
  if (method === 'update') {
    const { id, ...updates } = payload || {};
    const res = await fetch(`/api/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error((await res.json()).error || '更新定时任务失败');
    return res.json();
  }
  if (method === 'byTheme') {
    const res = await fetch(`/api/jobs/by-theme/${payload.themeId}`);
    if (!res.ok) throw new Error((await res.json()).error || '获取定时任务失败');
    return res.json();
  }
  return null;
}

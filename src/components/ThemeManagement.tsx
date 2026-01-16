import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Play, Pause, Archive, Trash2, Edit2, TrendingUp, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { Theme } from '../App';
import { InsightTab } from '@/features/workspace/components/InsightTab';
import { CACHE_VERSION } from '@/utils/cacheVersion';

interface ThemeManagementProps {
  themes: Theme[];
  setThemes: (themes: Theme[]) => void;
  selectedTheme: Theme | null;
  setSelectedTheme: (theme: Theme | null) => void;
  onRefresh?: () => void;
}

const PROMPT_PROFILES_TTL_MS = 5 * 60 * 1000;
let promptProfilesCache: { version: string; data: any[]; fetchedAt: number } | null = null;

const readPromptProfilesCache = () => {
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

const writePromptProfilesCache = (data: any[]) => {
  promptProfilesCache = { version: CACHE_VERSION, data, fetchedAt: Date.now() };
};

const createEmptyFormData = () => ({
  name: '',
  description: '',
  keywords: '',
  competitors: '',
  status: 'active' as Theme['status'],
  goal: '',
  persona: '',
  tone: '',
  contentTypes: '',
  forbiddenTags: '',
  promptProfileId: '',
  dailyOutputCount: '',
  minQualityScore: '',
  scheduleEnabled: false,
  schedulePreset: 'interval' as 'interval' | 'daily' | 'weekly' | 'cron',
  scheduleType: 'interval' as 'interval' | 'cron',
  intervalMinutes: '30',
  cronExpression: '*/30 * * * *',
  scheduleTime: '09:00',
  scheduleWeekday: '1',
  captureLimit: '50',
  schedulePriority: '5',
  scheduleJobId: '',
});

async function apiCall(method: string, url: string, body?: any) {
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

async function jobCall(method: string, payload?: any) {
  if (window.jobs) {
    if (method === 'create') return window.jobs.create(payload);
    if (method === 'update') return window.jobs.update(payload);
    if (method === 'byTheme') return window.jobs.byTheme(payload);
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

export function ThemeManagement({ themes, setThemes, selectedTheme, setSelectedTheme, onRefresh }: ThemeManagementProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [captureProgress, setCaptureProgress] = useState<{
    currentKeyword: string;
    currentIndex: number;
    totalKeywords: number;
    fetchedSoFar: number;
    insertedSoFar: number;
  } | null>(null);
  const [captureResult, setCaptureResult] = useState<{ themeId: string; total: number; inserted: number } | null>(null);
  const [promptProfiles, setPromptProfiles] = useState<any[]>([]);
  const [formData, setFormData] = useState(createEmptyFormData);

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const cachedProfiles = readPromptProfilesCache();
        if (cachedProfiles) {
          setPromptProfiles(cachedProfiles);
          return;
        }

        const res = await fetch('/api/prompt-profiles');
        const data = await res.json();
        const profiles = Array.isArray(data) ? data : [];
        setPromptProfiles(profiles);
        writePromptProfilesCache(profiles);
      } catch (error) {
        console.error('Failed to load prompt profiles:', error);
        setPromptProfiles([]);
      }
    };
    loadProfiles();
  }, []);

  const toNumber = (value: string, fallback?: number) => {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const parseTime = (timeValue: string) => {
    const [h, m] = (timeValue || '').split(':');
    const hour = clampNumber(Number(h || 9), 0, 23);
    const minute = clampNumber(Number(m || 0), 0, 59);
    return { hour, minute };
  };

  const buildCronExpression = () => {
    const { hour, minute } = parseTime(formData.scheduleTime);
    const minuteStr = String(minute).padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    if (formData.schedulePreset === 'daily') {
      return `${minuteStr} ${hourStr} * * *`;
    }
    if (formData.schedulePreset === 'weekly') {
      const weekday = clampNumber(toNumber(formData.scheduleWeekday, 1) ?? 1, 0, 6);
      return `${minuteStr} ${hourStr} * * ${weekday}`;
    }
    return formData.cronExpression.trim() || '*/30 * * * *';
  };

  const resetScheduleFields = () => {
    setFormData((prev) => ({
      ...prev,
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
    }));
  };

  const parseCronPreset = (expression: string | null) => {
    if (!expression) return { preset: 'cron' as const, time: '09:00', weekday: '1' };
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5) return { preset: 'cron' as const, time: '09:00', weekday: '1' };
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (dayOfMonth !== '*' || month !== '*') {
      return { preset: 'cron' as const, time: '09:00', weekday: '1' };
    }
    if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) {
      return { preset: 'cron' as const, time: '09:00', weekday: '1' };
    }
    const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    if (dayOfWeek === '*') {
      return { preset: 'daily' as const, time, weekday: '1' };
    }
    if (/^[0-6]$/.test(dayOfWeek)) {
      return { preset: 'weekly' as const, time, weekday: dayOfWeek };
    }
    return { preset: 'cron' as const, time, weekday: '1' };
  };

  const applyScheduleFromJob = (job: any) => {
    const params = (() => {
      if (!job?.params_json) return {};
      try {
        return JSON.parse(job.params_json);
      } catch (error) {
        console.error('解析定时任务参数失败:', error);
        return {};
      }
    })();

    const isCron = job?.schedule_type === 'cron';
    const cronPreset = parseCronPreset(job?.cron_expression || '');
    setFormData((prev) => ({
      ...prev,
      scheduleEnabled: job?.is_enabled === 1,
      schedulePreset: isCron ? cronPreset.preset : 'interval',
      scheduleType: isCron ? 'cron' : 'interval',
      intervalMinutes: job?.interval_minutes ? String(job.interval_minutes) : prev.intervalMinutes,
      cronExpression: job?.cron_expression || prev.cronExpression,
      scheduleTime: cronPreset.time,
      scheduleWeekday: cronPreset.weekday,
      captureLimit: params.limit ? String(params.limit) : prev.captureLimit,
      schedulePriority: job?.priority ? String(job.priority) : prev.schedulePriority,
      scheduleJobId: job?.id ? String(job.id) : prev.scheduleJobId,
    }));
  };

  const loadScheduleForTheme = async (theme: Theme) => {
    const themeId = Number(theme.id);
    if (!Number.isFinite(themeId)) {
      resetScheduleFields();
      return;
    }
    try {
      const job = await jobCall('byTheme', { themeId });
      if (job && !job.error) {
        applyScheduleFromJob(job);
      } else {
        resetScheduleFields();
      }
    } catch (error) {
      console.error('加载定时任务失败:', error);
      resetScheduleFields();
    }
  };

  const saveScheduleForTheme = async (themeId: number, themeName: string) => {
    const intervalMinutes = toNumber(formData.intervalMinutes, 30) ?? 30;
    const limit = toNumber(formData.captureLimit, 50) ?? 50;
    const priority = toNumber(formData.schedulePriority, 5) ?? 5;
    const cronExpression = buildCronExpression();

    const payload = {
      name: `${themeName} 定时抓取`,
      job_type: 'capture_theme' as const,
      theme_id: themeId,
      schedule_type: formData.schedulePreset === 'interval' ? 'interval' : 'cron',
      interval_minutes: formData.schedulePreset === 'interval' ? intervalMinutes : null,
      cron_expression: formData.schedulePreset === 'interval' ? null : cronExpression,
      params: { limit },
      is_enabled: formData.scheduleEnabled,
      priority,
    };

    if (formData.scheduleJobId) {
      await jobCall('update', { id: Number(formData.scheduleJobId), ...payload });
    } else if (formData.scheduleEnabled) {
      const created = await jobCall('create', payload);
      if (created?.id) {
        setFormData((prev) => ({ ...prev, scheduleJobId: String(created.id) }));
      }
    }

    if (formData.scheduleEnabled) {
      try {
        await (window as any).scheduler?.start?.();
      } catch (error) {
        console.error('启动调度器失败:', error);
      }
    }
  };

  const handleCapture = async (theme: Theme) => {
    if (theme.keywords.length === 0) {
      alert('该主题没有关键词，无法抓取');
      return;
    }
    setCapturing(theme.id);
    setCaptureResult(null);
    setCaptureProgress(null);
    let totalInserted = 0;
    let totalFetched = 0;
    try {
      for (let i = 0; i < theme.keywords.length; i++) {
        const kw = theme.keywords[i];
        setCaptureProgress({
          currentKeyword: kw.value,
          currentIndex: i + 1,
          totalKeywords: theme.keywords.length,
          fetchedSoFar: totalFetched,
          insertedSoFar: totalInserted,
        });
        const result = window.capture
          ? await window.capture.run({ keywordId: kw.id, limit: 20 })
          : await fetch('/api/capture/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywordId: kw.id, limit: 20 }),
            }).then(r => r.json());
        if (result.status === 'fetched') {
          totalFetched += result.total || 0;
          totalInserted += result.inserted || 0;
        }
      }
      setCaptureResult({ themeId: theme.id, total: totalFetched, inserted: totalInserted });
    } catch (err) {
      console.error('Capture failed:', err);
      alert('抓取失败: ' + (err as Error).message);
    } finally {
      setCapturing(null);
      setCaptureProgress(null);
    }
  };

  // 默认选择第一个主题
  if (!selectedTheme && themes.length > 0) {
    setSelectedTheme(themes[0]);
  }

  const handleCreateTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    const config = {
      goal: formData.goal || undefined,
      persona: formData.persona || undefined,
      tone: formData.tone || undefined,
      contentTypes: formData.contentTypes.split(',').map(v => v.trim()).filter(Boolean),
      forbiddenTags: formData.forbiddenTags.split(',').map(v => v.trim()).filter(Boolean),
      promptProfileId: toNumber(formData.promptProfileId),
      dailyOutputCount: toNumber(formData.dailyOutputCount),
      minQualityScore: toNumber(formData.minQualityScore),
    };
    const payload = {
      name: formData.name,
      description: formData.description,
      keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
      competitors: formData.competitors.split(',').map(c => c.trim()).filter(Boolean),
      status: formData.status,
      config,
    };

    try {
      let savedTheme: any = null;
      if (editingTheme) {
        savedTheme = await apiCall('PUT', `/api/themes/${editingTheme.id}`, { id: Number(editingTheme.id), ...payload });
      } else {
        savedTheme = await apiCall('POST', '/api/themes', payload);
      }
      const themeId = Number(savedTheme?.id || editingTheme?.id);
      if (Number.isFinite(themeId)) {
        try {
          await saveScheduleForTheme(themeId, savedTheme?.name || formData.name);
        } catch (error) {
          console.error('Failed to save schedule:', error);
        }
      }
      onRefresh?.();
    } catch (err) {
      console.error('Failed to save theme:', err);
    }

    setFormData(createEmptyFormData());
    setShowCreateModal(false);
    setEditingTheme(null);
  };

  const handleDeleteTheme = async (id: string) => {
    if (confirm('确定要删除这个主题吗？')) {
      try {
        await apiCall('DELETE', `/api/themes/${id}`, { id: Number(id) });
        onRefresh?.();
        if (selectedTheme?.id === id) {
          setSelectedTheme(null);
        }
      } catch (err) {
        console.error('Failed to delete theme:', err);
      }
    }
  };

  const handleUpdateStatus = async (id: string, status: Theme['status']) => {
    try {
      await apiCall('PATCH', `/api/themes/${id}/status`, { id: Number(id), status });
      onRefresh?.();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleEditTheme = (theme: Theme) => {
    setEditingTheme(theme);
    const defaults = createEmptyFormData();
    setFormData({
      ...defaults,
      name: theme.name,
      description: theme.description,
      keywords: theme.keywords.map(k => k.value).join(', '),
      competitors: theme.competitors.join(', '),
      status: theme.status,
      goal: theme.config?.goal || '',
      persona: theme.config?.persona || '',
      tone: theme.config?.tone || '',
      contentTypes: theme.config?.contentTypes?.join(', ') || '',
      forbiddenTags: theme.config?.forbiddenTags?.join(', ') || '',
      promptProfileId: theme.config?.promptProfileId ? String(theme.config.promptProfileId) : '',
      dailyOutputCount: theme.config?.dailyOutputCount ? String(theme.config.dailyOutputCount) : '',
      minQualityScore: theme.config?.minQualityScore ? String(theme.config.minQualityScore) : ''
    });
    setShowCreateModal(true);
    loadScheduleForTheme(theme);
  };

  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    theme.keywords.some(k => k.value.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statusConfig = {
    active: { label: '运营中', color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50' },
    paused: { label: '已暂停', color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50' },
    completed: { label: '已完成', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Theme Selector - Top Collapsible Panel */}
      <div className="bg-white border-b border-gray-200">
        {/* Collapsed View */}
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors"
            >
              {selectedTheme ? (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${statusConfig[selectedTheme.status].color}`}></div>
                  <span className="text-xs font-medium text-gray-900">{selectedTheme.name}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>{selectedTheme.keywords.length} 关键词</span>
                    <span>·</span>
                    <span>{selectedTheme.competitors.length} 竞品</span>
                  </div>
                  {capturing === selectedTheme.id && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>抓取中</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-500">选择主题</span>
              )}
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
            
            {selectedTheme && !isExpanded && (
              <div className="flex flex-wrap gap-1">
                {selectedTheme.keywords.slice(0, 5).map((keyword, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    {keyword.value}
                  </span>
                ))}
                {selectedTheme.keywords.length > 5 && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                    +{selectedTheme.keywords.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditingTheme(null);
              setFormData(createEmptyFormData());
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新建主题
          </button>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-3 bg-gray-50">
            <div className="w-full">
              <div className="relative mb-3 max-w-xl">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索主题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {filteredThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className={`group relative p-3 rounded border cursor-pointer transition-all w-64 flex-shrink-0 ${
                      selectedTheme?.id === theme.id
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setSelectedTheme(theme);
                      setIsExpanded(false);
                    }}
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusConfig[theme.status].color}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 mb-0.5 truncate">{theme.name}</div>
                        <div className="text-xs text-gray-500 line-clamp-2">{theme.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                      <span>{theme.keywords.length} 关键词</span>
                      <span>·</span>
                      <span>{theme.competitors.length} 竞品</span>
                      <span>·</span>
                      <span className={`px-1.5 py-0.5 rounded ${statusConfig[theme.status].bgColor} ${statusConfig[theme.status].textColor}`}>
                        {statusConfig[theme.status].label}
                      </span>
                    </div>

                    {/* 抓取进度显示 */}
                    {capturing === theme.id && captureProgress && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded">
                        <div className="flex items-center gap-2 text-xs text-blue-700 mb-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>正在抓取: {captureProgress.currentKeyword}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${(captureProgress.currentIndex / captureProgress.totalKeywords) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-blue-600">
                            {captureProgress.currentIndex}/{captureProgress.totalKeywords}
                          </span>
                        </div>
                        {captureProgress.fetchedSoFar > 0 && (
                          <div className="text-xs text-blue-600 mt-1">
                            已获取 {captureProgress.fetchedSoFar} 条，新增 {captureProgress.insertedSoFar} 条
                          </div>
                        )}
                      </div>
                    )}

                    {captureResult?.themeId === theme.id && (
                      <div className="mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        抓取完成: 获取 {captureResult.total} 条，新增 {captureResult.inserted} 条
                      </div>
                    )}

                    {/* Actions */}
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <div className="relative group/menu">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <div className="hidden group-hover/menu:block absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg py-1 z-50 min-w-[120px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTheme(theme);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3 h-3" />
                            编辑
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCapture(theme);
                            }}
                            disabled={capturing === theme.id}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {capturing === theme.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            {capturing === theme.id ? '抓取中...' : '抓取笔记'}
                          </button>
                          {theme.status === 'active' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(theme.id, 'paused');
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                            >
                              <Pause className="w-3 h-3" />
                              暂停
                            </button>
                          )}
                          {theme.status === 'paused' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(theme.id, 'active');
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                            >
                              <Play className="w-3 h-3" />
                              继续
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateStatus(theme.id, 'completed');
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                          >
                            <Archive className="w-3 h-3" />
                            归档
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTheme(theme.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {filteredThemes.length === 0 && (
                  <div className="w-full text-center py-8">
                    <div className="text-xs text-gray-400">暂无主题</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insight Analysis Content */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {selectedTheme ? (
          <div className="p-4">
            <InsightTab theme={selectedTheme} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <div className="text-sm text-gray-600 mb-2">请选择一个主题查看洞察分析</div>
              <button
                onClick={() => setIsExpanded(true)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                选择主题
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Theme Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg p-4 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="text-sm font-medium text-gray-900 mb-3">
              {editingTheme ? '编辑主题' : '创建新主题'}
            </div>
            <form onSubmit={handleCreateTheme} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">主题名称 *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：2024夏季防晒攻略"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">主题描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简要描述这个主题..."
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">关键词</label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="用逗号分隔，例如：防晒, 夏季护肤"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">竞品账号</label>
                <input
                  type="text"
                  value={formData.competitors}
                  onChange={(e) => setFormData({ ...formData, competitors: e.target.value })}
                  placeholder="用逗号分隔，例如：美妆博主A, 护肤达人B"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Theme['status'] })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="active">运营中</option>
                  <option value="paused">已暂停</option>
                  <option value="completed">已完成</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-medium text-gray-800 mb-2">内容生成配置</div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">目标</label>
                    <input
                      type="text"
                      value={formData.goal}
                      onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                      placeholder="收藏优先 / 评论优先 / 涨粉优先"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">受众画像</label>
                    <input
                      type="text"
                      value={formData.persona}
                      onChange={(e) => setFormData({ ...formData, persona: e.target.value })}
                      placeholder="例如：25-35岁职场女性"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">语气</label>
                    <input
                      type="text"
                      value={formData.tone}
                      onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                      placeholder="干货 / 亲和 / 专业"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">内容结构偏好</label>
                    <input
                      type="text"
                      value={formData.contentTypes}
                      onChange={(e) => setFormData({ ...formData, contentTypes: e.target.value })}
                      placeholder="用逗号分隔，例如：清单, 教程, 对比"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">禁用标签</label>
                    <input
                      type="text"
                      value={formData.forbiddenTags}
                      onChange={(e) => setFormData({ ...formData, forbiddenTags: e.target.value })}
                      placeholder="用逗号分隔，例如：医疗, 博彩"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">默认模板</label>
                    <select
                      value={formData.promptProfileId}
                      onChange={(e) => setFormData({ ...formData, promptProfileId: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="">未选择</option>
                      {promptProfiles.map((profile) => (
                        <option key={profile.id} value={String(profile.id)}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">每日产出数</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.dailyOutputCount}
                        onChange={(e) => setFormData({ ...formData, dailyOutputCount: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">质量阈值</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.minQualityScore}
                        onChange={(e) => setFormData({ ...formData, minQualityScore: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-800">定时抓取配置</div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, scheduleEnabled: !prev.scheduleEnabled }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      formData.scheduleEnabled ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      formData.scheduleEnabled ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">快捷设置</label>
                    <select
                      value={formData.schedulePreset}
                      onChange={(e) => {
                        const preset = e.target.value as 'interval' | 'daily' | 'weekly' | 'cron';
                        setFormData((prev) => ({
                          ...prev,
                          schedulePreset: preset,
                          scheduleType: preset === 'interval' ? 'interval' : 'cron',
                        }));
                      }}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="interval">固定间隔</option>
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                      <option value="cron">自定义 Cron</option>
                    </select>
                  </div>

                  {formData.schedulePreset === 'interval' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-700">执行间隔</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.intervalMinutes}
                        onChange={(e) => setFormData({ ...formData, intervalMinutes: e.target.value })}
                        className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <span className="text-xs text-gray-500">分钟</span>
                    </div>
                  )}

                  {(formData.schedulePreset === 'daily' || formData.schedulePreset === 'weekly') && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-gray-700">执行时间</label>
                      <input
                        type="time"
                        value={formData.scheduleTime}
                        onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                        className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      {formData.schedulePreset === 'weekly' && (
                        <>
                          <label className="text-xs text-gray-700">执行日</label>
                          <select
                            value={formData.scheduleWeekday}
                            onChange={(e) => setFormData({ ...formData, scheduleWeekday: e.target.value })}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                          >
                            <option value="1">周一</option>
                            <option value="2">周二</option>
                            <option value="3">周三</option>
                            <option value="4">周四</option>
                            <option value="5">周五</option>
                            <option value="6">周六</option>
                            <option value="0">周日</option>
                          </select>
                        </>
                      )}
                    </div>
                  )}

                  {formData.schedulePreset === 'cron' && (
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Cron 表达式</label>
                      <input
                        type="text"
                        value={formData.cronExpression}
                        onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                        placeholder="*/30 * * * *"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">格式: 分 时 日 月 周</p>
                    </div>
                  )}

                  {formData.schedulePreset !== 'interval' && (
                    <div className="text-[10px] text-gray-400">
                      当前表达式：{buildCronExpression()}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">抓取数量</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formData.captureLimit}
                        onChange={(e) => setFormData({ ...formData, captureLimit: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">优先级</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={formData.schedulePriority}
                        onChange={(e) => setFormData({ ...formData, schedulePriority: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">启用后保存会自动启动调度器</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTheme(null);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  {editingTheme ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

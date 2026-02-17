import { useState, useEffect, useRef } from 'react';
import { Plus, Search, MoreVertical, Play, Pause, Archive, Trash2, Edit2, TrendingUp, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { Theme } from '../App';
import { InsightTab } from '@/features/workspace/components/InsightTab';
import { ThemeFormModal } from './ThemeFormModal';
import { apiCall, createEmptyFormData, jobCall, readPromptProfilesCache, writePromptProfilesCache, type ThemeFormData } from './themeManagementUtils';

interface ThemeManagementProps {
  themes: Theme[];
  setThemes: (themes: Theme[]) => void;
  selectedTheme: Theme | null;
  setSelectedTheme: (theme: Theme | null) => void;
  onRefresh?: () => void;
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
  const [formData, setFormData] = useState<ThemeFormData>(createEmptyFormData);
  const [openMenuThemeId, setOpenMenuThemeId] = useState<string | null>(null);
  const menuCloseTimer = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (menuCloseTimer.current !== null) {
        window.clearTimeout(menuCloseTimer.current);
      }
    };
  }, []);

  const clearMenuCloseTimer = () => {
    if (menuCloseTimer.current !== null) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
  };

  const openMenu = (themeId: string) => {
    clearMenuCloseTimer();
    setOpenMenuThemeId(themeId);
  };

  const scheduleCloseMenu = (themeId: string) => {
    clearMenuCloseTimer();
    menuCloseTimer.current = window.setTimeout(() => {
      setOpenMenuThemeId((current) => (current === themeId ? null : current));
    }, 180);
  };

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
      // 兼容 jsonb 类型（对象）和字符串类型
      if (typeof job.params_json === 'object') return job.params_json;
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
  useEffect(() => {
    if (!selectedTheme && themes.length > 0) {
      setSelectedTheme(themes[0]);
    }
  }, [selectedTheme, themes, setSelectedTheme]);

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
        <div className="px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors min-w-0"
            >
              {selectedTheme ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${statusConfig[selectedTheme.status].color}`}></div>
                  <span className="text-xs font-medium text-gray-900 truncate max-w-[140px] sm:max-w-none">{selectedTheme.name}</span>
                  <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
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
              <div className="hidden sm:flex flex-wrap gap-1">
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
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
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
                      <div
                        className="relative"
                        onMouseEnter={() => openMenu(theme.id)}
                        onMouseLeave={() => scheduleCloseMenu(theme.id)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuThemeId === theme.id) {
                              setOpenMenuThemeId(null);
                              return;
                            }
                            openMenu(theme.id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        {openMenuThemeId === theme.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg py-1 z-50 min-w-[120px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuThemeId(null);
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
                                setOpenMenuThemeId(null);
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
                                  setOpenMenuThemeId(null);
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
                                  setOpenMenuThemeId(null);
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
                                setOpenMenuThemeId(null);
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
                                setOpenMenuThemeId(null);
                                handleDeleteTheme(theme.id);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3" />
                              删除
                            </button>
                          </div>
                        )}
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
      <ThemeFormModal
        open={showCreateModal}
        editingTheme={editingTheme}
        formData={formData}
        setFormData={setFormData}
        promptProfiles={promptProfiles}
        buildCronExpression={buildCronExpression}
        onClose={() => {
          setShowCreateModal(false);
          setEditingTheme(null);
        }}
        onSubmit={handleCreateTheme}
      />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckSquare, Clock, RefreshCw, Square, Trash2 } from 'lucide-react';
import type { AutoTask } from '@/features/task-management/types';
import { TaskFormModal } from '@/features/workspace/components/generation/TaskFormModal';
import { TaskCard } from './components/TaskCard';
import { TaskCenterFilters, type TabType } from './components/TaskCenterFilters';
import { getExecutionStatusStyle, getJobEnabledStyle, getTaskStatusStyle, getTaskTypeStyle, getUnifiedExecutionTypeStyle } from './constants/statusStyles';
import type { CaptureJob, GenerationTask, ThemeSummary, UnifiedExecutionItem } from './taskCenterTypes';
import { calculateDuration, formatDuration, formatTime, getScheduleText, mapJobToAutoTask, promptProfiles } from './taskCenterUtils';

const getGoalLabel = (goal: AutoTask['config']['goal']) => {
  switch (goal) {
    case 'collects':
      return '收藏优先';
    case 'comments':
      return '评论优先';
    case 'followers':
      return '涨粉优先';
    default:
      return goal;
  }
};

type CaptureRunState = {
  running?: boolean;
  progress?: { value: number; text?: string };
  success?: string;
  error?: string;
};

interface TaskCenterPageProps {
  themes: ThemeSummary[];
  onJumpToTheme: (themeId: string) => void;
  initialTab?: TabType;
  initialJobTypeFilter?: 'all' | 'capture' | 'daily_generate';
  initialThemeId?: string;
  onRequireXhsLogin?: () => void;
}

export function TaskCenterPage({
  themes,
  onJumpToTheme,
  initialTab,
  initialJobTypeFilter,
  initialThemeId,
  onRequireXhsLogin,
}: TaskCenterPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'schedule');
  const [scheduleJobs, setScheduleJobs] = useState<CaptureJob[]>([]);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [executions, setExecutions] = useState<UnifiedExecutionItem[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [jobTypeFilter, setJobTypeFilter] = useState<'all' | 'capture' | 'daily_generate'>(initialJobTypeFilter || 'all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'job_execution' | 'generation_task' | 'publish_record'>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [executionPage, setExecutionPage] = useState(1);
  const [executionTotal, setExecutionTotal] = useState(0);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [dailyThemeId, setDailyThemeId] = useState<string>(initialThemeId || (themes[0]?.id ? String(themes[0].id) : ''));
  const [editingTask, setEditingTask] = useState<AutoTask | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState('');
  const [taskMutatingId, setTaskMutatingId] = useState<string | null>(null);
  const [jobExecutionsById, setJobExecutionsById] = useState<Record<string, any[]>>({});
  const [jobExecutionsOpenId, setJobExecutionsOpenId] = useState<string | null>(null);
  const [canTriggerJob, setCanTriggerJob] = useState(false);
  const [captureRunState, setCaptureRunState] = useState<Record<string, CaptureRunState>>({});
  // 批量删除状态 - 使用 type-id 作为唯一键
  const [selectedExecutionKeys, setSelectedExecutionKeys] = useState<Set<string>>(new Set());
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const [deletingExecutionKey, setDeletingExecutionKey] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);

  const intervalOptions = [
    { value: 2, label: '每2分钟' },
    { value: 5, label: '每5分钟' },
    { value: 10, label: '每10分钟' },
    { value: 30, label: '每30分钟' },
    { value: 60, label: '每1小时' },
    { value: 120, label: '每2小时' },
    { value: 360, label: '每6小时' },
    { value: 720, label: '每12小时' },
    { value: 1440, label: '每天' },
  ];

  const executionPageSize = 6;

  const themeMap = useMemo(() => {
    const map = new Map<number, string>();
    themes.forEach((theme) => map.set(Number(theme.id), theme.name));
    return map;
  }, [themes]);

  useEffect(() => {
    if (initialThemeId) {
      setDailyThemeId(String(initialThemeId));
      return;
    }
    if (!dailyThemeId && themes.length > 0) {
      setDailyThemeId(String(themes[0].id));
    }
  }, [initialThemeId, themes, dailyThemeId]);

  useEffect(() => {
    if (!initialTab && !initialJobTypeFilter && !initialThemeId) return;
    const key = `${initialTab || ''}|${initialJobTypeFilter || ''}|${initialThemeId || ''}`;
    if (focusRef.current === key) return;
    focusRef.current = key;
    if (initialTab) setActiveTab(initialTab);
    if (initialJobTypeFilter) setJobTypeFilter(initialJobTypeFilter);
    if (initialThemeId) setDailyThemeId(String(initialThemeId));
  }, [initialTab, initialJobTypeFilter, initialThemeId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCanTriggerJob(true);
    }
  }, []);

  const updateCaptureRunState = (jobId: string, patch: Partial<CaptureRunState>) => {
    setCaptureRunState((prev) => ({
      ...prev,
      [jobId]: { ...(prev[jobId] || {}), ...patch },
    }));
  };

  const parseJobParams = (job: CaptureJob) => {
    const raw = (job as any)?.params_json;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  };

  const resolveCaptureLimit = (job: CaptureJob) => {
    const params = parseJobParams(job);
    const raw = Number(params?.limit ?? 20);
    const limit = Number.isFinite(raw) ? raw : 20;
    return Math.min(50, Math.max(1, limit));
  };

  const resolveThemeKeywords = (themeId?: number | null) => {
    if (!themeId) return [] as Array<{ id: number; value: string }>;
    const theme = themes.find((item) => String(item.id) === String(themeId));
    const rawKeywords = Array.isArray((theme as any)?.keywords) ? (theme as any).keywords : [];
    return rawKeywords
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null;
        const id = Number(entry.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        const value = entry.value || entry.keyword || `关键词#${id}`;
        return { id, value: String(value) };
      })
      .filter(Boolean) as Array<{ id: number; value: string }>;
  };

  const getKeywordLabel = (keywordId: number, themeId?: number | null) => {
    const keywords = resolveThemeKeywords(themeId);
    const match = keywords.find((kw) => kw.id === keywordId);
    return match?.value || `关键词#${keywordId}`;
  };

  const runCaptureForKeyword = async (keywordId: number, limit: number) => {
    if ((window as any).capture?.run) {
      const result = await (window as any).capture.run({ keywordId, limit });
      const needLogin = result?.code === 'NOT_LOGGED_IN'
        || /请先登录小红书账号|not\s*logged\s*in/i.test(String(result?.error || result?.message || ''));
      if (needLogin) {
        const error: any = new Error('请先登录小红书账号');
        error.code = 'NOT_LOGGED_IN';
        throw error;
      }
      return result;
    }
    const res = await fetch('/api/capture/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywordId, limit }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: any = new Error(data?.error || '抓取失败');
      error.code = data?.code;
      throw error;
    }
    return data;
  };

  const summarizeCaptureResult = (result: any) => {
    if (result?.status === 'cached') {
      const count = Array.isArray(result.items) ? result.items.length : 0;
      return { total: count, inserted: 0, cached: true };
    }
    return {
      total: Number(result?.total || 0),
      inserted: Number(result?.inserted || 0),
      cached: false,
    };
  };

  const loadScheduleJobs = async () => {
    console.log('[TaskCenter] Loading schedule jobs...');
    setCaptureLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const jobs = Array.isArray(data) ? data : [];
      console.log('[TaskCenter] Loaded schedule jobs:', jobs.length);
      setScheduleJobs(jobs);
    } catch (error) {
      console.error('Failed to load capture jobs:', error);
      setScheduleJobs([]);
    } finally {
      setCaptureLoading(false);
    }
  };

  const loadGenerationTasks = async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) {
      console.log('[TaskCenter] Loading generation tasks...');
      setGenerationLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('time_range', timeRange);
      params.set('limit', '50');
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      console.log('[TaskCenter] Loaded generation tasks:', data.length);
      setGenerationTasks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load generation tasks:', error);
      setGenerationTasks([]);
    } finally {
      if (!isBackgroundPoll) setGenerationLoading(false);
    }
  };

  const loadExecutions = async () => {
    console.log('[TaskCenter] Loading executions...');
    setExecutionLoading(true);
    try {
      const params = new URLSearchParams();
      if (historyStatusFilter !== 'all') params.set('status', historyStatusFilter);
      if (historyTypeFilter !== 'all') params.set('type', historyTypeFilter);
      params.set('time_range', timeRange);
      params.set('limit', String(executionPageSize));
      params.set('offset', String((executionPage - 1) * executionPageSize));
      params.set('includeTotal', '1');
      const res = await fetch(`/api/executions/unified?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data) ? data : data.items;
      console.log('[TaskCenter] Loaded executions:', items?.length || 0);
      setExecutions(Array.isArray(items) ? items : []);
      const total = Array.isArray(data) ? items?.length ?? 0 : Number(data.total || 0);
      setExecutionTotal(Number.isFinite(total) ? total : 0);
    } catch (error) {
      console.error('Failed to load executions:', error);
      setExecutions([]);
      setExecutionTotal(0);
    } finally {
      setExecutionLoading(false);
    }
  };

  // 加载调度任务数据
  useEffect(() => {
    console.log('[TaskCenter] useEffect triggered - activeTab:', activeTab, 'timeRange:', timeRange);
    if (activeTab !== 'schedule') return;
    loadScheduleJobs();
    loadGenerationTasks();
  }, [activeTab, timeRange]); // 只依赖 activeTab 和 timeRange

  // 加载执行历史数据
  useEffect(() => {
    console.log('[TaskCenter] useEffect triggered (history) - activeTab:', activeTab);
    if (activeTab !== 'history') return;
    loadExecutions();
  }, [activeTab, historyStatusFilter, historyTypeFilter, timeRange, executionPage]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    setExecutionPage(1);
  }, [activeTab, historyStatusFilter, historyTypeFilter, timeRange]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(executionTotal / executionPageSize) || 1);
    if (executionPage > totalPages) {
      setExecutionPage(totalPages);
    }
  }, [executionPage, executionTotal, executionPageSize]);

  useEffect(() => {
    if (activeTab !== 'schedule') return;
    const hasRunning = generationTasks.some(
      (task) => task.status === 'running' || task.status === 'queued'
    );
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadGenerationTasks(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, generationTasks, timeRange]);

  const handleToggleJob = async (job: CaptureJob) => {
    const enabled = job.is_enabled === true || job.is_enabled === 1;
    try {
      if ((window as any).jobs?.update) {
        await (window as any).jobs.update({ id: job.id, is_enabled: !enabled });
      } else {
        await fetch(`/api/jobs/${job.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_enabled: !enabled }),
        });
      }
      await loadScheduleJobs();
    } catch (error) {
      console.error('Failed to toggle job:', error);
    }
  };

  const handleTriggerJob = async (job: CaptureJob) => {
    try {
      const isCaptureJob = job.job_type === 'capture_theme' || job.job_type === 'capture_keyword';
      if (!isCaptureJob) {
        if ((window as any).jobs?.trigger) {
          await (window as any).jobs.trigger({ id: job.id });
        } else {
          const res = await fetch(`/api/jobs/${job.id}/trigger`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || '触发执行失败');
        }
        await loadScheduleJobs();
        return;
      }

      const jobKey = String(job.id);
      const limit = resolveCaptureLimit(job);
      updateCaptureRunState(jobKey, {
        running: true,
        progress: { value: 0, text: '准备抓取...' },
        success: undefined,
        error: undefined,
      });

      let totalFetched = 0;
      let totalInserted = 0;
      let cachedCount = 0;

      if (job.job_type === 'capture_keyword') {
        const keywordId = Number((job as any).keyword_id);
        if (!Number.isFinite(keywordId) || keywordId <= 0) {
          throw new Error('任务缺少关键词 ID');
        }
        updateCaptureRunState(jobKey, {
          progress: { value: 10, text: `正在抓取: ${getKeywordLabel(keywordId, job.theme_id)} (1/1)` },
        });
        const result = await runCaptureForKeyword(keywordId, limit);
        const summary = summarizeCaptureResult(result);
        totalFetched += summary.total;
        totalInserted += summary.inserted;
        if (summary.cached) cachedCount += summary.total;
      } else {
        const keywords = resolveThemeKeywords(job.theme_id);
        if (keywords.length === 0) {
          throw new Error('该主题没有关键词，无法抓取');
        }
        for (let i = 0; i < keywords.length; i += 1) {
          const kw = keywords[i];
          const progressValue = Math.round((i / keywords.length) * 100);
          updateCaptureRunState(jobKey, {
            progress: { value: progressValue, text: `正在抓取: ${kw.value} (${i + 1}/${keywords.length})` },
          });
          const result = await runCaptureForKeyword(kw.id, limit);
          const summary = summarizeCaptureResult(result);
          totalFetched += summary.total;
          totalInserted += summary.inserted;
          if (summary.cached) cachedCount += summary.total;
        }
      }

      const allCached = cachedCount > 0 && cachedCount === totalFetched && totalInserted === 0;
      const successText = allCached
        ? `命中缓存: 近 ${cachedCount} 条`
        : `抓取完成: 获取 ${totalFetched} 条，新增 ${totalInserted} 条`;
      updateCaptureRunState(jobKey, { running: false, progress: undefined, success: successText });
    } catch (error) {
      console.error('Failed to trigger job:', error);
      const err: any = error;
      if (err?.code === 'NOT_LOGGED_IN' || /请先登录小红书账号|not\s*logged\s*in/i.test(String(err?.message || ''))) {
        onRequireXhsLogin?.();
      }
      updateCaptureRunState(String(job.id), {
        running: false,
        progress: undefined,
        error: (err as Error)?.message || '抓取失败',
      });
    }
  };

  const handleUpdateInterval = async (job: CaptureJob, newInterval: number) => {
    try {
      if ((window as any).jobs?.update) {
        await (window as any).jobs.update({ id: job.id, interval_minutes: newInterval });
      } else {
        await fetch(`/api/jobs/${job.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interval_minutes: newInterval }),
        });
      }
      setEditingJobId(null);
      await loadScheduleJobs();
    } catch (error) {
      console.error('Failed to update interval:', error);
    }
  };

  const captureJobs = useMemo(
    () => scheduleJobs.filter((job) => job.job_type === 'capture_theme' || job.job_type === 'capture_keyword'),
    [scheduleJobs]
  );

  const dailyJobs = useMemo(
    () => scheduleJobs.filter((job) => job.job_type === 'daily_generate'),
    [scheduleJobs]
  );

  const filteredCaptureJobs = useMemo(() => {
    return captureJobs.filter((job) => {
      const enabled = job.is_enabled === true || job.is_enabled === 1;
      if (statusFilter === 'enabled') return enabled;
      if (statusFilter === 'paused') return !enabled;
      return true;
    });
  }, [captureJobs, statusFilter]);

  const filteredDailyJobs = useMemo(() => {
    return dailyJobs.filter((job) => {
      if (dailyThemeId && String(job.theme_id || '') !== String(dailyThemeId)) return false;
      const enabled = job.is_enabled === true || job.is_enabled === 1;
      if (statusFilter === 'enabled') return enabled;
      if (statusFilter === 'paused') return !enabled;
      return true;
    });
  }, [dailyJobs, dailyThemeId, statusFilter]);

  const dailyTasks = useMemo(() => filteredDailyJobs.map(mapJobToAutoTask), [filteredDailyJobs]);

  const unifiedScheduleItems = useMemo(() => {
    if (jobTypeFilter !== 'all') return [];
    const resolveSortTime = (value: string) => {
      const time = new Date(value || 0).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    const items = [
      ...filteredCaptureJobs.map((job) => ({
        kind: 'capture' as const,
        sortAt: job.next_run_at || '',
        job,
      })),
      ...dailyTasks.map((task) => ({
        kind: 'daily' as const,
        sortAt: task.nextRunAt || '',
        task,
      })),
    ];
    return items.sort((a, b) => resolveSortTime(b.sortAt) - resolveSortTime(a.sortAt));
  }, [jobTypeFilter, filteredCaptureJobs, dailyTasks]);

  const loadJobExecutions = async (jobId: string) => {
    try {
      const params = new URLSearchParams();
      params.set('jobId', String(jobId));
      params.set('limit', '5');
      const res = await fetch(`/api/jobs/executions?${params.toString()}`);
      const data = await res.json().catch(() => []);
      const items = Array.isArray(data) ? data : [];
      setJobExecutionsById((prev) => ({ ...prev, [jobId]: items }));
      return items;
    } catch (err) {
      console.error('Failed to load job executions:', err);
      return [];
    }
  };

  const handleTriggerDailyTask = async (task: AutoTask) => {
    setTaskSaveError('');
    setTaskMutatingId(task.id);
    try {
      const res = await fetch(`/api/jobs/${task.id}/trigger`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '触发执行失败');

      await loadJobExecutions(task.id);
      setJobExecutionsOpenId(task.id);
    } catch (err: any) {
      setTaskSaveError(err?.message || String(err));
    } finally {
      setTaskMutatingId(null);
    }
  };

  // 删除单条执行记录
  const handleDeleteExecution = async (type: string, id: number) => {
    const key = `${type}-${id}`;
    setDeletingExecutionKey(key);
    try {
      // 根据类型调用不同的删除 API
      let endpoint = '';
      if (type === 'job_execution') {
        endpoint = `/api/executions/${id}`;
      } else if (type === 'generation_task') {
        endpoint = `/api/tasks/${id}`;
      } else if (type === 'publish_record') {
        endpoint = `/api/publish-records/${id}`;
      }

      if (endpoint) {
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || '删除失败');
        }
      }

      setSelectedExecutionKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      // 重新加载数据
      await loadExecutions();
    } catch (err: any) {
      console.error('Failed to delete execution:', err);
      setTaskSaveError(err?.message || String(err));
    } finally {
      setDeletingExecutionKey(null);
    }
  };

  // 批量删除执行记录
  const handleBatchDeleteExecutions = async () => {
    if (selectedExecutionKeys.size === 0) return;
    setBatchDeleteLoading(true);
    try {
      // 按类型分组
      const byType: Record<string, number[]> = {};
      selectedExecutionKeys.forEach((key) => {
        const [type, idStr] = key.split('-');
        const id = Number(idStr);
        if (!byType[type]) byType[type] = [];
        byType[type].push(id);
      });

      // 并行删除各类型
      const promises: Promise<void>[] = [];

      if (byType.job_execution?.length) {
        promises.push(
          fetch('/api/executions/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: byType.job_execution }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data?.error || '删除调度执行失败');
            }
          })
        );
      }

      // generation_task 批量删除
      if (byType.generation_task?.length) {
        promises.push(
          fetch('/api/tasks/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: byType.generation_task }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data?.error || '删除内容生成任务失败');
            }
          })
        );
      }

      // publish_record 批量删除
      if (byType.publish_record?.length) {
        promises.push(
          fetch('/api/publish-records/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: byType.publish_record }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data?.error || '删除发布记录失败');
            }
          })
        );
      }

      await Promise.all(promises);
      setSelectedExecutionKeys(new Set());
      // 重新加载数据
      await loadExecutions();
    } catch (err: any) {
      console.error('Failed to batch delete:', err);
      setTaskSaveError(err?.message || String(err));
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  // 全选/取消全选当前页
  const handleToggleSelectAll = () => {
    const currentKeys = new Set(executions.map((e) => `${e.type}-${e.id}`));
    const allSelected = executions.every((e) => selectedExecutionKeys.has(`${e.type}-${e.id}`));
    if (allSelected) {
      setSelectedExecutionKeys((prev) => {
        const next = new Set(prev);
        currentKeys.forEach((key) => next.delete(key));
        return next;
      });
    } else {
      setSelectedExecutionKeys((prev) => new Set([...prev, ...currentKeys]));
    }
  };

  // 切换单条选择
  const handleToggleSelect = (type: string, id: number) => {
    const key = `${type}-${id}`;
    setSelectedExecutionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleDailyTaskStatus = async (task: AutoTask) => {
    setTaskSaveError('');
    setTaskMutatingId(task.id);
    try {
      const res = await fetch(`/api/jobs/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.status === 'active' ? 'paused' : 'active' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '切换任务状态失败');

      try {
        await (window as any).scheduler?.start?.();
      } catch (error) {
        console.error('启动调度器失败:', error);
      }

      await loadScheduleJobs();
    } catch (err: any) {
      setTaskSaveError(err?.message || String(err));
    } finally {
      setTaskMutatingId(null);
    }
  };

  const handleDeleteDailyTask = async (task: AutoTask) => {
    if (!window.confirm(`确定删除任务「${task.name}」吗？`)) return;

    setTaskSaveError('');
    setTaskMutatingId(task.id);
    try {
      const res = await fetch(`/api/jobs/${task.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '删除任务失败');

      await loadScheduleJobs();
    } catch (err: any) {
      setTaskSaveError(err?.message || String(err));
    } finally {
      setTaskMutatingId(null);
    }
  };

  // 删除抓取任务
  const handleDeleteCaptureJob = async (job: CaptureJob) => {
    if (!window.confirm(`确定删除抓取任务「${job.name}」吗？`)) return;

    setTaskSaveError('');
    setTaskMutatingId(String(job.id));
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '删除任务失败');

      await loadScheduleJobs();
    } catch (err: any) {
      setTaskSaveError(err?.message || String(err));
    } finally {
      setTaskMutatingId(null);
    }
  };

  const handleToggleDailyTaskExecutions = async (taskId: string) => {
    const next = jobExecutionsOpenId === taskId ? null : taskId;
    setJobExecutionsOpenId(next);
    if (next) await loadJobExecutions(taskId);
  };

  const handleOpenTaskForm = (task?: AutoTask) => {
    if (task?.themeId) {
      setDailyThemeId(String(task.themeId));
    }
    setTaskSaveError('');
    setEditingTask(task ?? null);
    setShowTaskForm(true);
  };

  const handleSaveTask = async (payload: any) => {
    if (!payload?.theme_id) {
      setTaskSaveError('请先选择主题');
      return;
    }

    setTaskSaving(true);
    setTaskSaveError('');
    try {
      const isNewTask = !editingTask || editingTask.id === 'new';
      if (!isNewTask) {
        const res = await fetch(`/api/jobs/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || '更新定时任务失败');
      } else {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || '创建定时任务失败');
      }

      try {
        if (payload.is_enabled) await (window as any).scheduler?.start?.();
      } catch (error) {
        console.error('启动调度器失败:', error);
      }

      setShowTaskForm(false);
      setEditingTask(null);
      await loadScheduleJobs();
    } catch (err: any) {
      setTaskSaveError(err?.message || String(err));
      throw err;
    } finally {
      setTaskSaving(false);
    }
  };

  const taskFormThemeId = editingTask?.themeId ? String(editingTask.themeId) : dailyThemeId;
  const executionTotalPages = executionTotal ? Math.ceil(executionTotal / executionPageSize) : 1;
  const executionPages = useMemo(() => {
    const totalPages = executionTotalPages;
    const windowSize = 5;
    let start = Math.max(1, executionPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    if (end - start < windowSize - 1) {
      start = Math.max(1, end - windowSize + 1);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [executionPage, executionTotalPages]);

  const renderCaptureJobCard = (job: CaptureJob) => {
    const enabled = job.is_enabled === true || job.is_enabled === 1;
    const themeName = job.theme_id ? themeMap.get(job.theme_id) : null;
    const scheduleNode = editingJobId === job.id ? (
      <select
        autoFocus
        value={job.interval_minutes || 60}
        onChange={(e) => handleUpdateInterval(job, Number(e.target.value))}
        onBlur={() => setEditingJobId(null)}
        className="px-1 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
      >
        {intervalOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <button
        onClick={() => setEditingJobId(job.id)}
        className="text-blue-600 hover:text-blue-700 hover:underline"
        title="点击修改周期"
      >
        {getScheduleText(job)}
      </button>
    );

    const runState = captureRunState[String(job.id)];
    const isRunning = !!runState?.running;
    const actions: Array<{
      label: string;
      onClick: () => void | Promise<void>;
      variant: 'primary' | 'warning' | 'danger' | 'default';
      disabled?: boolean;
      loading?: boolean;
    }> = [
      {
        label: enabled ? '暂停' : '启用',
        onClick: () => handleToggleJob(job),
        variant: enabled ? 'warning' : 'primary',
      },
      {
        label: isRunning ? '抓取中...' : '立即执行',
        onClick: () => handleTriggerJob(job),
        variant: 'primary',
        disabled: !canTriggerJob || isRunning,
        loading: isRunning,
      },
    ];

    if (job.theme_id) {
      actions.push({
        label: '去主题',
        onClick: () => onJumpToTheme(String(job.theme_id)),
        variant: 'default',
      });
    }

    const isMutating = taskMutatingId === String(job.id);

    return (
      <TaskCard
        key={`capture-${job.id}`}
        title={job.name}
        typeBadge={getTaskTypeStyle('capture')}
        statusBadge={getJobEnabledStyle(enabled)}
        metadata={[
          { label: '主题', value: themeName || '-' },
          { label: '周期', value: scheduleNode, highlight: true },
          { label: '下次', value: formatTime(job.next_run_at), highlight: true },
          { label: '上次', value: job.last_status || '-' },
        ]}
        actions={actions}
        progress={isRunning ? runState?.progress : undefined}
        success={!isRunning ? runState?.success : undefined}
        error={!isRunning ? runState?.error : undefined}
        onDelete={() => handleDeleteCaptureJob(job)}
        deleteLoading={isMutating}
      />
    );
  };

  const renderDailyTaskCard = (task: AutoTask) => {
    const mutating = taskMutatingId === task.id;
    const executions = jobExecutionsById[task.id] || [];
    const executionsOpen = jobExecutionsOpenId === task.id;

    return (
      <TaskCard
        key={`daily-${task.id}`}
        title={task.name}
        typeBadge={getTaskTypeStyle('daily_generate')}
        statusBadge={getJobEnabledStyle(task.status === 'active')}
        metadata={[
          { label: '目标', value: getGoalLabel(task.config.goal) },
          { label: '语气', value: task.config.tone },
          { label: '数量', value: `${task.config.outputCount} 个/次`, highlight: true },
          { label: '质量', value: `≥${task.config.minQualityScore}`, highlight: true },
          { label: '上次', value: formatTime(task.lastRunAt || null) },
          { label: '下次', value: formatTime(task.nextRunAt), highlight: true },
        ]}
        actions={[
          {
            label: '编辑',
            onClick: () => handleOpenTaskForm(task),
            variant: 'default',
            disabled: mutating,
          },
          {
            label: mutating ? '处理中...' : '立即执行',
            onClick: () => handleTriggerDailyTask(task),
            variant: 'primary',
            disabled: mutating,
            loading: mutating,
          },
          {
            label: mutating ? '处理中...' : (task.status === 'active' ? '暂停' : '启动'),
            onClick: () => handleToggleDailyTaskStatus(task),
            variant: 'warning',
            disabled: mutating,
            loading: mutating,
          },
        ]}
        onDelete={() => handleDeleteDailyTask(task)}
        deleteLoading={mutating}
        expandable={{
          label: executionsOpen ? '收起执行历史' : '查看执行历史',
          expanded: executionsOpen,
          onToggle: () => handleToggleDailyTaskExecutions(task.id),
          content: (
            <div className="space-y-2 text-xs">
              {executions.length === 0 ? (
                <div className="text-xs text-gray-400">暂无执行记录</div>
              ) : (
                executions.map((execution: any) => {
                  const style = getExecutionStatusStyle(execution.status);
                  return (
                    <div key={String(execution.id)} className="text-xs border border-gray-200 rounded p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">#{execution.id} · {String(execution.trigger_type || '')}</span>
                        <span className={`px-2 py-0.5 rounded ${style.bg} ${style.text}`}>{style.label}</span>
                      </div>
                      <div className="text-gray-500 mt-1">
                        {execution.created_at ? formatTime(String(execution.created_at)) : '-'}
                      </div>
                      {execution.error_message ? (
                        <div className="text-red-600 mt-1">{String(execution.error_message)}</div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ),
        }}
      />
    );
  };

  const renderGenerationTaskCard = (task: GenerationTask) => {
    const themeName = task.theme_id ? themeMap.get(task.theme_id) : null;
    const isRunning = task.status === 'running' || task.status === 'queued';
    const isCompleted = task.status === 'completed' || task.status === 'done';
    const progressValue = Math.max(0, Math.min(100, task.progress ?? 0));
    const durationText = calculateDuration(task.started_at, task.finished_at);

    return (
      <TaskCard
        key={task.id}
        title={themeName ? `${themeName} 生成任务` : `任务 #${task.id}`}
        statusBadge={getTaskStatusStyle(task.status)}
        metadata={[
          { label: '创建', value: formatTime(task.created_at) },
          { label: '开始', value: formatTime(task.started_at) },
          { label: '完成', value: formatTime(task.finished_at) },
          { label: '耗时', value: durationText },
          { label: '模型', value: task.model || '-' },
        ]}
        progress={isRunning ? { value: progressValue, text: progressValue > 0 ? `进度 ${progressValue}%` : '等待执行...' } : undefined}
        success={isCompleted ? `已完成 · 耗时 ${durationText}` : undefined}
        error={task.error_message || undefined}
      />
    );
  };

  const renderExecutionCard = (execution: UnifiedExecutionItem) => {
    const key = `${execution.type}-${execution.id}`;
    const isSelected = selectedExecutionKeys.has(key);
    const isDeleting = deletingExecutionKey === key;
    const typeStyle = getUnifiedExecutionTypeStyle(execution.type);

    return (
      <TaskCard
        key={key}
        title={execution.title}
        typeBadge={typeStyle}
        statusBadge={getExecutionStatusStyle(execution.status)}
        metadata={[
          { label: '类型', value: typeStyle.label },
          ...(execution.subtitle ? [{ label: '信息', value: execution.subtitle }] : []),
          { label: '时间', value: formatTime(execution.created_at) },
          { label: '耗时', value: formatDuration(execution.duration_ms) },
        ]}
        progress={execution.status === 'running' && execution.progress ? { value: execution.progress, text: `进度 ${execution.progress}%` } : undefined}
        error={execution.error_message || undefined}
        selectable
        selected={isSelected}
        onToggleSelect={() => handleToggleSelect(execution.type, execution.id)}
        onDelete={() => handleDeleteExecution(execution.type, execution.id)}
        deleteLoading={isDeleting}
      />
    );
  };

  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded overflow-hidden">
      <div className="p-3">
        <TaskCenterFilters
          activeTab={activeTab}
          onTabChange={setActiveTab}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          jobTypeFilter={jobTypeFilter}
          onJobTypeChange={setJobTypeFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          themes={themes}
          selectedThemeId={dailyThemeId}
          onThemeChange={setDailyThemeId}
          onCreateTask={() => handleOpenTaskForm()}
          historyStatusFilter={historyStatusFilter}
          onHistoryStatusChange={setHistoryStatusFilter}
          historyTypeFilter={historyTypeFilter}
          onHistoryTypeChange={setHistoryTypeFilter}
        />
      </div>

      <div className={`flex-1 p-4 ${activeTab === 'history' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {taskSaveError ? (
              <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
                {taskSaveError}
              </div>
            ) : null}

            {captureLoading && generationLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                加载中...
              </div>
            ) : (
              <>
                {/* 调度任务部分 */}
                {jobTypeFilter === 'all' ? (
                  <div className="space-y-2">
                    {unifiedScheduleItems.length === 0 && generationTasks.length === 0 ? (
                      <div className="text-center py-10 text-gray-500">
                        <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <div className="text-sm">暂无调度任务</div>
                        <div className="text-xs mt-1">可在主题设置中开启定时抓取或新建定时生成</div>
                      </div>
                    ) : (
                      <>
                        {unifiedScheduleItems.map((item) =>
                          item.kind === 'capture'
                            ? renderCaptureJobCard(item.job)
                            : renderDailyTaskCard(item.task)
                        )}
                        {generationTasks.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="text-xs text-gray-400 mb-2">生成任务</div>
                            <div className="space-y-2">
                              {generationTasks.map(renderGenerationTaskCard)}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : jobTypeFilter === 'capture' ? (
                  <div className="space-y-2">
                    {filteredCaptureJobs.length === 0 ? (
                      <div className="text-center py-10 text-gray-500">
                        <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <div className="text-sm">暂无抓取调度任务</div>
                        <div className="text-xs mt-1">可在主题设置中开启定时抓取</div>
                      </div>
                    ) : (
                      filteredCaptureJobs.map(renderCaptureJobCard)
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dailyTasks.length === 0 ? (
                      <div className="text-center py-10 text-gray-500">
                        <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <div className="text-sm">暂无定时生成任务</div>
                        <div className="text-xs mt-1">可在任务中心新建定时生成</div>
                      </div>
                    ) : (
                      dailyTasks.map(renderDailyTaskCard)
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="h-full flex flex-col">
            {/* 批量操作工具栏 */}
            {executions.length > 0 && (
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
                <button
                  onClick={handleToggleSelectAll}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                >
                  {executions.every((e) => selectedExecutionKeys.has(`${e.type}-${e.id}`)) ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  全选
                </button>
                {selectedExecutionKeys.size > 0 && (
                  <>
                    <span className="text-xs text-gray-400">已选 {selectedExecutionKeys.size} 条</span>
                    <button
                      onClick={handleBatchDeleteExecutions}
                      disabled={batchDeleteLoading}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      {batchDeleteLoading ? '删除中...' : '批量删除'}
                    </button>
                  </>
                )}
              </div>
            )}

            {executionLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                加载中...
              </div>
            ) : executions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <div className="text-sm">暂无执行记录</div>
                <div className="text-xs mt-1">调度执行后将显示在这里</div>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {executions.map(renderExecutionCard)}
              </div>
            )}

            {executionTotal > 0 && (
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <div>共 {executionTotal} 条</div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExecutionPage((prev) => Math.max(1, prev - 1))}
                    disabled={executionPage <= 1}
                    className="px-2 py-1 border border-gray-200 rounded disabled:opacity-50"
                  >
                    上一页
                  </button>
                  {executionPages.map((page) => (
                    <button
                      key={page}
                      onClick={() => setExecutionPage(page)}
                      className={`px-2 py-1 border rounded ${
                        page === executionPage ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setExecutionPage((prev) => Math.min(executionTotalPages, prev + 1))}
                    disabled={executionPage >= executionTotalPages}
                    className="px-2 py-1 border border-gray-200 rounded disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <TaskFormModal
        themeId={taskFormThemeId}
        editingTask={editingTask}
        showTaskForm={showTaskForm}
        taskSaving={taskSaving}
        taskSaveError={taskSaveError}
        promptProfiles={promptProfiles}
        onClose={() => {
          setShowTaskForm(false);
          setEditingTask(null);
          setTaskSaveError('');
        }}
        onSave={handleSaveTask}
      />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Calendar, CheckCircle2, Loader, Plus, RefreshCw } from 'lucide-react';
import type { AutoTask } from '@/features/task-management/types';
import { TaskFormModal } from '@/features/workspace/components/generation/TaskFormModal';
import { CaptureTabContent } from './components/CaptureTabContent';
import type { CaptureJob, GenerationTask, JobExecution, ThemeSummary } from './taskCenterTypes';
import { calculateDuration, formatDuration, formatTime, getExecutionStatusColor, getExecutionStatusText, getStatusColor, getStatusText, mapJobToAutoTask, promptProfiles } from './taskCenterUtils';

interface TaskCenterPageProps {
  themes: ThemeSummary[];
  onJumpToTheme: (themeId: string) => void;
  initialTab?: 'capture' | 'generation' | 'executions';
  initialJobTypeFilter?: 'all' | 'capture' | 'daily_generate';
  initialThemeId?: string;
}

export function TaskCenterPage({
  themes,
  onJumpToTheme,
  initialTab,
  initialJobTypeFilter,
  initialThemeId,
}: TaskCenterPageProps) {
  const [activeTab, setActiveTab] = useState<'capture' | 'generation' | 'executions'>(initialTab || 'capture');
  const [scheduleJobs, setScheduleJobs] = useState<CaptureJob[]>([]);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [captureStatusFilter, setCaptureStatusFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [jobTypeFilter, setJobTypeFilter] = useState<'all' | 'capture' | 'daily_generate'>(initialJobTypeFilter || 'all');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'queued' | 'running' | 'completed' | 'failed'>('all');
  const [executionStatusFilter, setExecutionStatusFilter] = useState<'all' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout'>('all');
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

  const selectedDailyTheme = useMemo(
    () => themes.find((theme) => String(theme.id) === String(dailyThemeId)) || null,
    [themes, dailyThemeId]
  );

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

  const loadScheduleJobs = async () => {
    setCaptureLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const jobs = Array.isArray(data) ? data : [];
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
      setGenerationLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (taskStatusFilter !== 'all') params.set('status', taskStatusFilter);
      params.set('time_range', timeRange);
      params.set('limit', '50');
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      setGenerationTasks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load generation tasks:', error);
      setGenerationTasks([]);
    } finally {
      if (!isBackgroundPoll) setGenerationLoading(false);
    }
  };

  const loadExecutions = async () => {
    setExecutionLoading(true);
    try {
      const params = new URLSearchParams();
      if (executionStatusFilter !== 'all') params.set('status', executionStatusFilter);
      params.set('time_range', timeRange);
      params.set('limit', String(executionPageSize));
      params.set('offset', String((executionPage - 1) * executionPageSize));
      params.set('includeTotal', '1');
      const res = await fetch(`/api/executions?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data) ? data : data.items;
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

  useEffect(() => {
    if (activeTab === 'capture') loadScheduleJobs();
    if (activeTab === 'generation') loadGenerationTasks();
    if (activeTab === 'executions') loadExecutions();
  }, [activeTab, taskStatusFilter, executionStatusFilter, timeRange, executionPage]);

  useEffect(() => {
    if (activeTab !== 'executions') return;
    setExecutionPage(1);
  }, [activeTab, executionStatusFilter, timeRange]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(executionTotal / executionPageSize) || 1);
    if (executionPage > totalPages) {
      setExecutionPage(totalPages);
    }
  }, [executionPage, executionTotal, executionPageSize]);

  useEffect(() => {
    if (activeTab !== 'generation') return;
    const hasRunning = generationTasks.some(
      (task) => task.status === 'running' || task.status === 'queued'
    );
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadGenerationTasks(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, generationTasks, taskStatusFilter, timeRange]);

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
      if ((window as any).jobs?.trigger) {
        await (window as any).jobs.trigger({ id: job.id });
        await loadScheduleJobs();
      }
    } catch (error) {
      console.error('Failed to trigger job:', error);
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
      if (captureStatusFilter === 'enabled') return enabled;
      if (captureStatusFilter === 'paused') return !enabled;
      return true;
    });
  }, [captureJobs, captureStatusFilter]);

  const filteredDailyJobs = useMemo(() => {
    return dailyJobs.filter((job) => {
      if (dailyThemeId && String(job.theme_id || '') !== String(dailyThemeId)) return false;
      const enabled = job.is_enabled === true || job.is_enabled === 1;
      if (captureStatusFilter === 'enabled') return enabled;
      if (captureStatusFilter === 'paused') return !enabled;
      return true;
    });
  }, [dailyJobs, dailyThemeId, captureStatusFilter]);

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

  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded overflow-hidden">
      <div className="border-b border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <div className="ml-auto flex items-center gap-2">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as 'capture' | 'generation' | 'executions')}
              className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="capture">抓取调度</option>
              <option value="generation">生成任务</option>
              <option value="executions">执行历史</option>
            </select>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | 'all')}
              className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
              <option value="all">全部时间</option>
            </select>

            {activeTab === 'capture' && (
              <>
                <select
                  value={jobTypeFilter}
                  onChange={(e) => setJobTypeFilter(e.target.value as 'all' | 'capture' | 'daily_generate')}
                  className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="all">全部调度</option>
                  <option value="capture">抓取任务</option>
                  <option value="daily_generate">定时生成</option>
                </select>
                <select
                  value={captureStatusFilter}
                  onChange={(e) => setCaptureStatusFilter(e.target.value as 'all' | 'enabled' | 'paused')}
                  className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="all">全部状态</option>
                  <option value="enabled">启用</option>
                  <option value="paused">暂停</option>
                </select>
                {(jobTypeFilter === 'daily_generate' || jobTypeFilter === 'all') && (
                  <>
                    <select
                      value={dailyThemeId}
                      onChange={(e) => setDailyThemeId(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      {themes.length === 0 ? (
                        <option value="">暂无主题</option>
                      ) : (
                        themes.map((theme) => (
                          <option key={theme.id} value={String(theme.id)}>{theme.name}</option>
                        ))
                      )}
                    </select>
                    <button
                      onClick={() => handleOpenTaskForm()}
                      disabled={!selectedDailyTheme}
                      className="px-2.5 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      新建定时
                    </button>
                  </>
                )}
              </>
            )}

        {activeTab === 'generation' && (
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value as typeof taskStatusFilter)}
                className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="all">全部状态</option>
                <option value="queued">排队中</option>
                <option value="running">生成中</option>
                <option value="completed">已完成</option>
                <option value="failed">失败</option>
              </select>
            )}

            {activeTab === 'executions' && (
              <select
                value={executionStatusFilter}
                onChange={(e) => setExecutionStatusFilter(e.target.value as typeof executionStatusFilter)}
                className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="all">全部状态</option>
                <option value="pending">等待</option>
                <option value="running">执行中</option>
                <option value="success">成功</option>
                <option value="failed">失败</option>
                <option value="canceled">已取消</option>
                <option value="timeout">超时</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-1 p-4 ${activeTab === 'executions' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'capture' && (
          <CaptureTabContent
            captureLoading={captureLoading}
            jobTypeFilter={jobTypeFilter}
            unifiedScheduleItems={unifiedScheduleItems}
            filteredCaptureJobs={filteredCaptureJobs}
            dailyTasks={dailyTasks}
            taskSaveError={taskSaveError}
            taskMutatingId={taskMutatingId}
            jobExecutionsById={jobExecutionsById}
            jobExecutionsOpenId={jobExecutionsOpenId}
            intervalOptions={intervalOptions}
            editingJobId={editingJobId}
            setEditingJobId={setEditingJobId}
            handleUpdateInterval={handleUpdateInterval}
            handleToggleJob={handleToggleJob}
            handleTriggerJob={handleTriggerJob}
            onJumpToTheme={onJumpToTheme}
            handleOpenTaskForm={handleOpenTaskForm}
            loadJobExecutions={loadJobExecutions}
            loadScheduleJobs={loadScheduleJobs}
            setTaskSaveError={setTaskSaveError}
            setTaskMutatingId={setTaskMutatingId}
            setJobExecutionsOpenId={setJobExecutionsOpenId}
            themeMap={themeMap}
          />
        )}

        {activeTab === 'generation' && (
          <div className="space-y-2">
            {generationLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                加载中...
              </div>
            ) : generationTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Activity className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <div className="text-sm">暂无生成任务</div>
                <div className="text-xs mt-1">开始内容生成后将显示在这里</div>
              </div>
            ) : (
              generationTasks.map((task) => {
                const themeName = task.theme_id ? themeMap.get(task.theme_id) : null;
                const isRunning = task.status === 'running' || task.status === 'queued';
                const isCompleted = task.status === 'completed' || task.status === 'done';
                const progressValue = Math.max(0, Math.min(100, task.progress ?? 0));
                return (
                  <div key={task.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {themeName ? `${themeName} 生成任务` : `任务 #${task.id}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">创建时间 · {formatTime(task.created_at)}</div>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600 mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">开始</span>
                        <span className="text-gray-700">{formatTime(task.started_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">完成</span>
                        <span className="text-gray-700">{formatTime(task.finished_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">耗时</span>
                        <span className="text-gray-700">{calculateDuration(task.started_at, task.finished_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">模型</span>
                        <span className="text-gray-700">{task.model || '-'}</span>
                      </div>
                    </div>

                    {isRunning && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all"
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                          <Loader className="w-3 h-3 animate-spin" />
                          {progressValue > 0 ? `进度 ${progressValue}%` : '等待执行...'}
                        </div>
                      </div>
                    )}

                    {isCompleted && (
                      <div className="text-xs text-green-600 flex items-center gap-1 mt-2">
                        <CheckCircle2 className="w-3 h-3" />
                        已完成 · 耗时 {calculateDuration(task.started_at, task.finished_at)}
                      </div>
                    )}

                    {task.error_message && (
                      <div className="flex items-start gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded mt-2">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        {task.error_message}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="h-full flex flex-col">
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
              <div className="space-y-2 flex-1">
                {executions.map((execution) => (
                  <div key={execution.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium text-gray-900">任务 #{execution.job_id}</div>
                      <span className={`px-2 py-0.5 text-xs rounded ${getExecutionStatusColor(execution.status)}`}>
                        {getExecutionStatusText(execution.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">触发</span>
                        <span className="text-gray-700">{execution.trigger_type || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">时间</span>
                        <span className="text-gray-700">{formatTime(execution.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">耗时</span>
                        <span className="text-gray-700">{formatDuration(execution.duration_ms)}</span>
                      </div>
                    </div>

                    {execution.error_message && (
                      <div className="text-xs text-red-600 mt-2">{execution.error_message}</div>
                    )}
                  </div>
                ))}
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

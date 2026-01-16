import { useEffect, useMemo, useState } from 'react';
import { Activity, Calendar, Clock, Play, Pause, RefreshCw, Settings } from 'lucide-react';

type CaptureJob = {
  id: number;
  name: string;
  job_type: string;
  theme_id: number | null;
  schedule_type: 'interval' | 'cron';
  interval_minutes: number | null;
  cron_expression: string | null;
  is_enabled: number | boolean;
  next_run_at: string | null;
  last_status: string | null;
};

type GenerationTask = {
  id: number;
  theme_id: number | null;
  status: string;
  prompt: string | null;
  model: string | null;
  result_asset_id: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type JobExecution = {
  id: number;
  job_id: number;
  status: string;
  trigger_type: string;
  duration_ms: number | null;
  result_json: any;
  error_message: string | null;
  created_at: string;
};

type ThemeSummary = {
  id: string;
  name: string;
};

interface TaskCenterPageProps {
  themes: ThemeSummary[];
  onJumpToTheme: (themeId: string) => void;
}

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (ms: number | null) => {
  if (!ms) return '-';
  return `${(ms / 1000).toFixed(1)}s`;
};

const getScheduleText = (job: CaptureJob) => {
  if (job.schedule_type === 'interval' && job.interval_minutes) {
    if (job.interval_minutes < 60) return `每${job.interval_minutes}分钟`;
    return `每${job.interval_minutes / 60}小时`;
  }
  return job.cron_expression || '-';
};

export function TaskCenterPage({ themes, onJumpToTheme }: TaskCenterPageProps) {
  const [activeTab, setActiveTab] = useState<'capture' | 'generation' | 'executions'>('capture');
  const [captureJobs, setCaptureJobs] = useState<CaptureJob[]>([]);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [captureStatusFilter, setCaptureStatusFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'queued' | 'running' | 'done' | 'failed'>('all');
  const [executionStatusFilter, setExecutionStatusFilter] = useState<'all' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout'>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [editingJobId, setEditingJobId] = useState<number | null>(null);

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

  const themeMap = useMemo(() => {
    const map = new Map<number, string>();
    themes.forEach((theme) => map.set(Number(theme.id), theme.name));
    return map;
  }, [themes]);

  const loadCaptureJobs = async () => {
    setCaptureLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const jobs = Array.isArray(data) ? data : [];
      const captureOnly = jobs.filter((job: CaptureJob) =>
        job.job_type === 'capture_theme' || job.job_type === 'capture_keyword'
      );
      const filtered = captureOnly.filter((job: CaptureJob) => {
        const enabled = job.is_enabled === true || job.is_enabled === 1;
        if (captureStatusFilter === 'enabled') return enabled;
        if (captureStatusFilter === 'paused') return !enabled;
        return true;
      });
      setCaptureJobs(filtered);
    } catch (error) {
      console.error('Failed to load capture jobs:', error);
      setCaptureJobs([]);
    } finally {
      setCaptureLoading(false);
    }
  };

  const loadGenerationTasks = async () => {
    setGenerationLoading(true);
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
      setGenerationLoading(false);
    }
  };

  const loadExecutions = async () => {
    setExecutionLoading(true);
    try {
      const params = new URLSearchParams();
      if (executionStatusFilter !== 'all') params.set('status', executionStatusFilter);
      params.set('time_range', timeRange);
      params.set('limit', '50');
      const res = await fetch(`/api/executions?${params.toString()}`);
      const data = await res.json();
      setExecutions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load executions:', error);
      setExecutions([]);
    } finally {
      setExecutionLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'capture') loadCaptureJobs();
    if (activeTab === 'generation') loadGenerationTasks();
    if (activeTab === 'executions') loadExecutions();
  }, [activeTab, captureStatusFilter, taskStatusFilter, executionStatusFilter, timeRange]);

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
      await loadCaptureJobs();
    } catch (error) {
      console.error('Failed to toggle job:', error);
    }
  };

  const handleTriggerJob = async (job: CaptureJob) => {
    try {
      if ((window as any).jobs?.trigger) {
        await (window as any).jobs.trigger({ id: job.id });
        await loadCaptureJobs();
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
      await loadCaptureJobs();
    } catch (error) {
      console.error('Failed to update interval:', error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded overflow-hidden">
      <div className="border-b border-gray-200 p-3">
        <div className="flex items-center gap-2">
          {(['capture', 'generation', 'executions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs rounded transition-all ${
                activeTab === tab ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab === 'capture' && '抓取调度'}
              {tab === 'generation' && '生成任务'}
              {tab === 'executions' && '执行历史'}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
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
              <select
                value={captureStatusFilter}
                onChange={(e) => setCaptureStatusFilter(e.target.value as 'all' | 'enabled' | 'paused')}
                className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="all">全部状态</option>
                <option value="enabled">启用</option>
                <option value="paused">暂停</option>
              </select>
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
                <option value="done">已完成</option>
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

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'capture' && (
          <div className="space-y-2">
            {captureLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                加载中...
              </div>
            ) : captureJobs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <div className="text-sm">暂无抓取调度任务</div>
                <div className="text-xs mt-1">可在主题设置中开启定时抓取</div>
              </div>
            ) : (
              captureJobs.map((job) => {
                const enabled = job.is_enabled === true || job.is_enabled === 1;
                const themeName = job.theme_id ? themeMap.get(job.theme_id) : null;
                return (
                  <div key={job.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{job.name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          {themeName ? `主题：${themeName}` : '主题：-'} ·
                          {editingJobId === job.id ? (
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
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {enabled ? '启用中' : '已暂停'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                      <span>下次：{formatTime(job.next_run_at)}</span>
                      <span>上次：{job.last_status || '-'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleJob(job)}
                        className={`flex-1 px-2 py-1 text-xs rounded ${enabled ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                      >
                        {enabled ? '暂停' : '启用'}
                      </button>
                      <button
                        onClick={() => handleTriggerJob(job)}
                        disabled={!(window as any).jobs?.trigger}
                        className="flex-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        立即执行
                      </button>
                      {job.theme_id && (
                        <button
                          onClick={() => onJumpToTheme(String(job.theme_id))}
                          className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded"
                        >
                          去主题
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
                return (
                  <div key={task.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {themeName ? `${themeName} 生成任务` : `任务 #${task.id}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {task.status} · {formatTime(task.created_at)}
                        </div>
                        {task.error_message && (
                          <div className="text-xs text-red-600 mt-1">{task.error_message}</div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                        {task.model || 'default'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="space-y-2">
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
              executions.map((execution) => (
                <div key={execution.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">任务 #{execution.job_id}</div>
                      <div className="text-xs text-gray-500">
                        {execution.status} · {execution.trigger_type} · {formatTime(execution.created_at)}
                      </div>
                      {execution.error_message && (
                        <div className="text-xs text-red-600 mt-1">{execution.error_message}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">耗时 {formatDuration(execution.duration_ms)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

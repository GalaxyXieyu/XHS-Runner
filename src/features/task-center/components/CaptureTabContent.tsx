import { Clock, RefreshCw } from 'lucide-react';
import type { AutoTask } from '@/features/task-management/types';
import { ScheduledJobCard } from '@/features/workspace/components/generation/ScheduledJobCard';
import type { CaptureJob, JobExecution, UnifiedScheduleItem } from '../taskCenterTypes';
import { formatTime, getScheduleText } from '../taskCenterUtils';

interface IntervalOption {
  label: string;
  value: number;
}

interface CaptureTabContentProps {
  captureLoading: boolean;
  jobTypeFilter: 'all' | 'capture' | 'daily_generate';
  unifiedScheduleItems: UnifiedScheduleItem[];
  filteredCaptureJobs: CaptureJob[];
  dailyTasks: AutoTask[];
  taskSaveError: string;
  taskMutatingId: string | null;
  jobExecutionsById: Record<string, JobExecution[]>;
  jobExecutionsOpenId: string | null;
  intervalOptions: IntervalOption[];
  editingJobId: number | null;
  setEditingJobId: (id: number | null) => void;
  handleUpdateInterval: (job: CaptureJob, minutes: number) => void;
  handleToggleJob: (job: CaptureJob) => void;
  handleTriggerJob: (job: CaptureJob) => void;
  onJumpToTheme: (themeId: string) => void;
  handleOpenTaskForm: (task?: AutoTask) => void;
  loadJobExecutions: (jobId: string) => Promise<any[]>;
  loadScheduleJobs: () => Promise<void>;
  setTaskSaveError: (message: string) => void;
  setTaskMutatingId: (id: string | null) => void;
  setJobExecutionsOpenId: (id: string | null) => void;
  themeMap: Map<number, string>;
}

export function CaptureTabContent({
  captureLoading,
  jobTypeFilter,
  unifiedScheduleItems,
  filteredCaptureJobs,
  dailyTasks,
  taskSaveError,
  taskMutatingId,
  jobExecutionsById,
  jobExecutionsOpenId,
  intervalOptions,
  editingJobId,
  setEditingJobId,
  handleUpdateInterval,
  handleToggleJob,
  handleTriggerJob,
  onJumpToTheme,
  handleOpenTaskForm,
  loadJobExecutions,
  loadScheduleJobs,
  setTaskSaveError,
  setTaskMutatingId,
  setJobExecutionsOpenId,
  themeMap,
}: CaptureTabContentProps) {
  return (
    <div className="space-y-4">
      {captureLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          加载中...
        </div>
      ) : (
        <>
          {jobTypeFilter === 'all' && (
            <div className="space-y-2">
              {unifiedScheduleItems.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <div className="text-sm">暂无调度任务</div>
                  <div className="text-xs mt-1">可在主题设置中开启定时抓取或新建定时生成</div>
                </div>
              ) : (
                unifiedScheduleItems.map((item) => {
                  if (item.kind === 'capture') {
                    const job = item.job;
                    const enabled = job.is_enabled === true || job.is_enabled === 1;
                    const themeName = job.theme_id ? themeMap.get(job.theme_id) : null;
                    return (
                      <div key={`capture-${job.id}`} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900">{job.name}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-600">抓取</span>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {enabled ? '启用中' : '已暂停'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600 mt-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">主题</span>
                            <span className="text-gray-700">{themeName || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">周期</span>
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
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">下次</span>
                            <span className="text-gray-700">{formatTime(job.next_run_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">上次</span>
                            <span className="text-gray-700">{job.last_status || '-'}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
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
                  }

                  const task = item.task;
                  return (
                    <ScheduledJobCard
                      key={`daily-${task.id}`}
                      task={task}
                      typeLabel="定时生成"
                      mutating={taskMutatingId === task.id}
                      executions={jobExecutionsById[task.id] || []}
                      executionsOpen={jobExecutionsOpenId === task.id}
                      onEdit={() => handleOpenTaskForm(task)}
                      onTrigger={async () => {
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
                      }}
                      onToggleStatus={async () => {
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
                      }}
                      onDelete={async () => {
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
                      }}
                      onToggleExecutions={async () => {
                        const next = jobExecutionsOpenId === task.id ? null : task.id;
                        setJobExecutionsOpenId(next);
                        if (next) await loadJobExecutions(task.id);
                      }}
                    />
                  );
                })
              )}
            </div>
          )}

          {jobTypeFilter === 'capture' && (
            <div className="space-y-2">
              {filteredCaptureJobs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <div className="text-sm">暂无抓取调度任务</div>
                  <div className="text-xs mt-1">可在主题设置中开启定时抓取</div>
                </div>
              ) : (
                filteredCaptureJobs.map((job) => {
                  const enabled = job.is_enabled === true || job.is_enabled === 1;
                  const themeName = job.theme_id ? themeMap.get(job.theme_id) : null;
                  return (
                    <div key={job.id} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-medium text-gray-900">{job.name}</div>
                        <span className={`px-2 py-0.5 text-xs rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {enabled ? '启用中' : '已暂停'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600 mt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">主题</span>
                          <span className="text-gray-700">{themeName || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">周期</span>
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
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">下次</span>
                          <span className="text-gray-700">{formatTime(job.next_run_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">上次</span>
                          <span className="text-gray-700">{job.last_status || '-'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
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

          {jobTypeFilter === 'daily_generate' && (
            <div className="space-y-2">
              {taskSaveError ? (
                <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
                  {taskSaveError}
                </div>
              ) : null}
              {dailyTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <div className="text-sm">暂无定时生成任务</div>
                  <div className="text-xs mt-1">可在任务中心新建定时生成</div>
                </div>
              ) : (
                dailyTasks.map((task) => (
                  <ScheduledJobCard
                    key={task.id}
                    task={task}
                    typeLabel="定时生成"
                    mutating={taskMutatingId === task.id}
                    executions={jobExecutionsById[task.id] || []}
                    executionsOpen={jobExecutionsOpenId === task.id}
                    onEdit={() => handleOpenTaskForm(task)}
                    onTrigger={async () => {
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
                    }}
                    onToggleStatus={async () => {
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
                    }}
                    onDelete={async () => {
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
                    }}
                    onToggleExecutions={async () => {
                      const next = jobExecutionsOpenId === task.id ? null : task.id;
                      setJobExecutionsOpenId(next);
                      if (next) await loadJobExecutions(task.id);
                    }}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

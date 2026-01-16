// 抓取计划状态行 - 显示在主题详情页
import { useState, useEffect } from 'react';
import CaptureScheduleModal from './CaptureScheduleModal';
import ExecutionHistoryModal from './ExecutionHistoryModal';

interface ScheduledJob {
  id: number;
  is_enabled: number;
  schedule_type: string;
  interval_minutes: number | null;
  cron_expression: string | null;
  next_run_at: string | null;
  last_status: string | null;
}

interface SchedulerStatus {
  running: boolean;
  paused: boolean;
  queueSize: number;
  activeJobs: number;
  nextExecution: string | null;
}

interface Props {
  themeId: number;
  themeName: string;
}

export default function CaptureScheduleStatus({ themeId, themeName }: Props) {
  const [job, setJob] = useState<ScheduledJob | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);

  useEffect(() => {
    loadJob();
    loadSchedulerStatus();
  }, [themeId]);

  const loadJob = async () => {
    try {
      const data = await (window as any).jobs?.byTheme({ themeId });
      setJob(data || null);
    } catch (e) {
      console.error('加载任务失败:', e);
    }
  };

  const loadSchedulerStatus = async () => {
    const schedulerApi = (window as any).scheduler;
    if (!schedulerApi?.status) {
      setSchedulerStatus(null);
      return;
    }
    setSchedulerLoading(true);
    try {
      const status = await schedulerApi.status();
      setSchedulerStatus(status || null);
    } catch (e) {
      console.error('加载调度器状态失败:', e);
    } finally {
      setSchedulerLoading(false);
    }
  };

  const handleSchedulerStart = async () => {
    const schedulerApi = (window as any).scheduler;
    if (!schedulerApi?.start) return;
    setSchedulerLoading(true);
    try {
      await schedulerApi.start();
    } catch (e) {
      console.error('启动调度器失败:', e);
    } finally {
      setSchedulerLoading(false);
    }
    await loadSchedulerStatus();
  };

  const handleSchedulerToggle = async () => {
    const schedulerApi = (window as any).scheduler;
    if (!schedulerApi) return;
    setSchedulerLoading(true);
    try {
      if (schedulerStatus?.paused) {
        await schedulerApi.resume?.();
      } else {
        await schedulerApi.pause?.();
      }
    } catch (e) {
      console.error('更新调度器状态失败:', e);
    } finally {
      setSchedulerLoading(false);
    }
    await loadSchedulerStatus();
  };

  const formatNextRun = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getSchedulerLabel = () => {
    if (!schedulerStatus || !schedulerStatus.running) return '未启动';
    if (schedulerStatus.paused) return '已暂停';
    return '运行中';
  };

  const getScheduleText = () => {
    if (!job) return '';
    if (job.schedule_type === 'interval' && job.interval_minutes) {
      if (job.interval_minutes < 60) return `每${job.interval_minutes}分钟`;
      return `每${job.interval_minutes / 60}小时`;
    }
    return job.cron_expression || '';
  };

  return (
    <>
      <div className="flex items-start justify-between py-2 px-3 bg-gray-50 rounded text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">定时抓取:</span>
            {job && job.is_enabled ? (
              <>
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-green-600">已启用</span>
                <span className="text-gray-400">({getScheduleText()})</span>
                {job.next_run_at && (
                  <span className="text-gray-400">下次: {formatNextRun(job.next_run_at)}</span>
                )}
              </>
            ) : (
              <>
                <span className="w-2 h-2 bg-gray-300 rounded-full" />
                <span className="text-gray-400">未设置</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>调度器:</span>
            <span>{getSchedulerLabel()}</span>
            {schedulerStatus && (
              <>
                <span className="text-gray-400">队列 {schedulerStatus.queueSize}</span>
                <span className="text-gray-400">执行中 {schedulerStatus.activeJobs}</span>
                {schedulerStatus.nextExecution && (
                  <span className="text-gray-400">下次: {formatNextRun(schedulerStatus.nextExecution)}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {job && (
              <button
                onClick={() => setShowHistory(true)}
                className="text-gray-400 hover:text-gray-600"
                title="查看历史"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="text-blue-500 hover:text-blue-600"
            >
              设置
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!schedulerStatus?.running ? (
              <button
                onClick={handleSchedulerStart}
                disabled={schedulerLoading}
                className="text-xs text-blue-500 hover:text-blue-600 disabled:opacity-50"
              >
                启动调度
              </button>
            ) : (
              <button
                onClick={handleSchedulerToggle}
                disabled={schedulerLoading}
                className="text-xs text-blue-500 hover:text-blue-600 disabled:opacity-50"
              >
                {schedulerStatus.paused ? '恢复调度' : '暂停调度'}
              </button>
            )}
          </div>
        </div>
      </div>

      <CaptureScheduleModal
        themeId={themeId}
        themeName={themeName}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={loadJob}
      />

      {job && (
        <ExecutionHistoryModal
          jobId={job.id}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

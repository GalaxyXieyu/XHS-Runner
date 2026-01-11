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

interface Props {
  themeId: number;
  themeName: string;
}

export default function CaptureScheduleStatus({ themeId, themeName }: Props) {
  const [job, setJob] = useState<ScheduledJob | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadJob();
  }, [themeId]);

  const loadJob = async () => {
    try {
      const data = await (window as any).jobs?.byTheme({ themeId });
      setJob(data || null);
    } catch (e) {
      console.error('加载任务失败:', e);
    }
  };

  const formatNextRun = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      hour: '2-digit', minute: '2-digit'
    });
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
      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
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

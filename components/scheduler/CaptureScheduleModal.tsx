// 抓取计划设置弹窗
import { useState, useEffect } from 'react';

interface ScheduledJob {
  id: number;
  name: string;
  job_type: string;
  theme_id: number | null;
  keyword_id: number | null;
  schedule_type: 'interval' | 'cron';
  interval_minutes: number | null;
  cron_expression: string | null;
  params_json: string | null;
  is_enabled: number;
  priority: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count: number;
  success_count: number;
  fail_count: number;
}

interface Props {
  themeId: number;
  themeName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const INTERVAL_PRESETS = [
  { label: '15分钟', value: 15 },
  { label: '30分钟', value: 30 },
  { label: '1小时', value: 60 },
  { label: '2小时', value: 120 },
  { label: '6小时', value: 360 },
  { label: '12小时', value: 720 },
  { label: '24小时', value: 1440 },
];

export default function CaptureScheduleModal({ themeId, themeName, isOpen, onClose, onSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<ScheduledJob | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<'interval' | 'cron'>('interval');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [cronExpression, setCronExpression] = useState('*/30 * * * *');
  const [limit, setLimit] = useState(50);
  const [priority, setPriority] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen && themeId) {
      loadJob();
    }
  }, [isOpen, themeId]);

  const loadJob = async () => {
    setLoading(true);
    try {
      const existingJob = await (window as any).jobs?.byTheme({ themeId });
      if (existingJob) {
        setJob(existingJob);
        setIsEnabled(existingJob.is_enabled === 1);
        setScheduleType(existingJob.schedule_type);
        setIntervalMinutes(existingJob.interval_minutes || 30);
        setCronExpression(existingJob.cron_expression || '*/30 * * * *');
        setPriority(existingJob.priority);
        if (existingJob.params_json) {
          const params = JSON.parse(existingJob.params_json);
          setLimit(params.limit || 50);
        }
      }
    } catch (e) {
      console.error('加载任务失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        name: `${themeName} 定时抓取`,
        job_type: 'capture_theme' as const,
        theme_id: themeId,
        schedule_type: scheduleType,
        interval_minutes: scheduleType === 'interval' ? intervalMinutes : null,
        cron_expression: scheduleType === 'cron' ? cronExpression : null,
        params: { limit },
        is_enabled: isEnabled,
        priority,
      };

      if (job) {
        await (window as any).jobs?.update({ id: job.id, ...payload });
      } else {
        await (window as any).jobs?.create(payload);
      }
      onSave();
      onClose();
    } catch (e) {
      console.error('保存失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async () => {
    if (!job) return;
    try {
      await (window as any).jobs?.trigger({ id: job.id });
      alert('已触发执行');
    } catch (e) {
      console.error('触发失败:', e);
    }
  };

  const handleDelete = async () => {
    if (!job || !confirm('确定删除此定时任务？')) return;
    try {
      await (window as any).jobs?.delete({ id: job.id });
      setJob(null);
      setIsEnabled(false);
      onSave();
    } catch (e) {
      console.error('删除失败:', e);
    }
  };

  if (!isOpen) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">抓取计划设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* 启用开关 */}
            <div className="flex items-center justify-between">
              <span className="font-medium">启用定时抓取</span>
              <button
                onClick={() => setIsEnabled(!isEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isEnabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  isEnabled ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            {/* 调度方式 */}
            <div className="space-y-2">
              <label className="font-medium">调度方式</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scheduleType === 'interval'}
                    onChange={() => setScheduleType('interval')}
                  />
                  固定间隔
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scheduleType === 'cron'}
                    onChange={() => setScheduleType('cron')}
                  />
                  Cron 表达式
                </label>
              </div>
            </div>

            {/* 间隔设置 */}
            {scheduleType === 'interval' ? (
              <div className="space-y-2">
                <label className="font-medium">执行间隔</label>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setIntervalMinutes(p.value)}
                      className={`px-3 py-1 rounded text-sm ${
                        intervalMinutes === p.value
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span>自定义:</span>
                  <input
                    type="number"
                    value={intervalMinutes}
                    onChange={e => setIntervalMinutes(Number(e.target.value))}
                    className="w-20 px-2 py-1 border rounded"
                    min={1}
                  />
                  <span>分钟</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="font-medium">Cron 表达式</label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="*/30 * * * *"
                />
                <p className="text-xs text-gray-500">
                  格式: 分 时 日 月 周 (例: */30 * * * * = 每30分钟)
                </p>
              </div>
            )}

            {/* 高级设置 */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-500 hover:underline"
              >
                {showAdvanced ? '收起' : '展开'}高级设置
              </button>
              {showAdvanced && (
                <div className="mt-2 p-3 bg-gray-50 rounded space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="w-24">抓取数量:</label>
                    <input
                      type="number"
                      value={limit}
                      onChange={e => setLimit(Number(e.target.value))}
                      className="w-20 px-2 py-1 border rounded"
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-24">优先级:</label>
                    <input
                      type="number"
                      value={priority}
                      onChange={e => setPriority(Number(e.target.value))}
                      className="w-20 px-2 py-1 border rounded"
                      min={1}
                      max={10}
                    />
                    <span className="text-xs text-gray-500">(1最高-10最低)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 执行状态 */}
            {job && (
              <div className="p-3 bg-gray-50 rounded space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">上次执行:</span>
                  <span>
                    {formatTime(job.last_run_at)}
                    {job.last_status && (
                      <span className={job.last_status === 'success' ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                        {job.last_status === 'success' ? '✓' : '✗'}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">下次执行:</span>
                  <span>{formatTime(job.next_run_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">统计:</span>
                  <span>成功 {job.success_count} / 失败 {job.fail_count}</span>
                </div>
                {job.last_error && (
                  <div className="text-red-500 text-xs mt-1">
                    错误: {job.last_error}
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            {job && (
              <div className="flex gap-2">
                <button
                  onClick={handleTrigger}
                  className="flex-1 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  立即执行
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-2 text-red-500 border border-red-500 rounded hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

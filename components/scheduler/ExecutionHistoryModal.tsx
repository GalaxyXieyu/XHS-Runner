// 执行历史弹窗
import { useState, useEffect } from 'react';

interface JobExecution {
  id: number;
  job_id: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_json: string | null;
  error_message: string | null;
  retry_count: number;
  trigger_type: string;
  created_at: string;
}

interface Props {
  jobId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function ExecutionHistoryModal({ jobId, isOpen, onClose }: Props) {
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && jobId) {
      loadExecutions();
    }
  }, [isOpen, jobId]);

  const loadExecutions = async () => {
    setLoading(true);
    try {
      const data = await (window as any).executions?.list({ jobId, limit: 50 });
      setExecutions(data || []);
    } catch (e) {
      console.error('加载执行历史失败:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'failed': return '✗';
      case 'running': return '⟳';
      case 'pending': return '○';
      case 'canceled': return '⊘';
      case 'timeout': return '⏱';
      default: return '?';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'failed': case 'timeout': return 'text-red-500';
      case 'running': return 'text-blue-500';
      case 'canceled': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  const parseResult = (json: string | null) => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">执行历史</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          ) : executions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">暂无执行记录</div>
          ) : (
            <div className="space-y-2">
              {executions.map(exec => {
                const result = parseResult(exec.result_json);
                return (
                  <div key={exec.id} className="p-3 bg-gray-50 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{formatTime(exec.started_at)}</span>
                      <span className={`font-medium ${getStatusColor(exec.status)}`}>
                        {getStatusIcon(exec.status)} {exec.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-gray-500">
                      <span>耗时: {formatDuration(exec.duration_ms)}</span>
                      {result && (
                        <span>抓取 {result.total || 0} / 新增 {result.inserted || 0}</span>
                      )}
                    </div>
                    {exec.error_message && (
                      <div className="mt-1 text-red-500 text-xs truncate">
                        {exec.error_message}
                      </div>
                    )}
                    {exec.retry_count > 0 && (
                      <div className="mt-1 text-orange-500 text-xs">
                        重试 {exec.retry_count} 次
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

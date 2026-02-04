import { Calendar, Trash2 } from 'lucide-react';
import type { AutoTask } from '@/features/task-management/types';

export function ScheduledJobCard({
  task,
  mutating,
  executions,
  executionsOpen,
  onEdit,
  onTrigger,
  onToggleStatus,
  onDelete,
  onToggleExecutions,
}: {
  task: AutoTask;
  mutating: boolean;
  executions: any[];
  executionsOpen: boolean;
  onEdit: () => void;
  onTrigger: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onToggleExecutions: () => void;
}) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-gray-900 mb-1">{task.name}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {task.schedule}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs ${
            task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {task.status === 'active' ? '运行中' : '已暂停'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
        <div>生成：{task.config.outputCount}个/次</div>
        <div>质量：≥{task.config.minQualityScore}</div>
        <div>成功率：{task.totalRuns > 0 ? Math.round((task.successfulRuns / task.totalRuns) * 100) : 0}%</div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={mutating}
        >
          编辑
        </button>

        <button
          className="flex-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={mutating}
          onClick={onTrigger}
        >
          {mutating ? '处理中...' : '立即执行'}
        </button>

        <button
          className="flex-1 px-2 py-1 text-xs bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={mutating}
          onClick={onToggleStatus}
        >
          {mutating ? '处理中...' : (task.status === 'active' ? '暂停' : '启动')}
        </button>

        <button
          aria-label="删除任务"
          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={mutating}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3">
        <button className="text-xs text-gray-500 hover:text-gray-700" onClick={onToggleExecutions}>
          {executionsOpen ? '收起执行历史' : '查看执行历史'}
        </button>

        {executionsOpen ? (
          <div className="mt-2 space-y-2">
            {executions.length === 0 ? (
              <div className="text-xs text-gray-400">暂无执行记录</div>
            ) : (
              executions.map((e: any) => (
                <div key={String(e.id)} className="text-xs border border-gray-200 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">#{e.id} · {String(e.trigger_type || '')}</span>
                    <span
                      className={`px-2 py-0.5 rounded ${
                        e.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : e.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {String(e.status)}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-1">
                    {e.created_at ? new Date(String(e.created_at)).toLocaleString('zh-CN') : '-'}
                  </div>
                  {e.error_message ? (
                    <div className="text-red-600 mt-1">{String(e.error_message)}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

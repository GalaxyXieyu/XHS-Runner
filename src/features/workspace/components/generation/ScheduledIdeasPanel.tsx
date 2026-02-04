import { Calendar } from 'lucide-react';
import { useMemo } from 'react';

export type ScheduledIdeaTask = {
  id: number;
  status: string;
  prompt: string | null;
  model?: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function ScheduledIdeasPanel({
  loading,
  error,
  items,
  onRefresh,
  onOpenInAgent,
  onRerun,
}: {
  loading: boolean;
  error: string | null;
  items: ScheduledIdeaTask[];
  onRefresh: () => void;
  onOpenInAgent: (prompt: string) => void;
  onRerun: (prompt: string) => void;
}) {
  const todayItems = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return items.filter((t) => {
      const created = new Date(t.created_at);
      return created >= startOfToday;
    });
  }, [items]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium text-gray-900">今日 ideas</div>
          <div className="text-xs text-gray-500 mt-0.5">来自 daily_generate（最近 7 天里筛出今天的记录）</div>
        </div>
        <button
          onClick={onRefresh}
          className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          disabled={loading}
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {error ? (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
          {error}
        </div>
      ) : null}

      {loading && todayItems.length === 0 ? (
        <div className="text-xs text-gray-500">加载中...</div>
      ) : todayItems.length === 0 ? (
        <div className="text-xs text-gray-500">今天还没有产出 ideas。</div>
      ) : (
        <div className="space-y-2">
          {todayItems.slice(0, 5).map((t) => (
            <div key={String(t.id)} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>#{t.id} · {new Date(t.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <div className="text-sm text-gray-900 mt-1 break-words">{t.prompt || '(空)'} </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    t.status === 'done'
                      ? 'bg-green-100 text-green-700'
                      : t.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {t.status === 'done' ? '已完成' : t.status === 'failed' ? '失败' : '进行中'}
                </span>
              </div>

              {t.error_message ? (
                <div className="text-xs text-red-600 mt-2">{t.error_message}</div>
              ) : null}

              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => onOpenInAgent(t.prompt || '')}
                  disabled={!t.prompt}
                >
                  Open in Agent
                </button>
                <button
                  className="flex-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => onRerun(t.prompt || '')}
                  disabled={!t.prompt}
                >
                  Rerun
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

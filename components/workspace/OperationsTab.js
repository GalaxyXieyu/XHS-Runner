import { useState } from 'react';

export default function OperationsTab({ theme }) {
  const [queueCount, setQueueCount] = useState(null);
  const [status, setStatus] = useState('');

  async function handleRefreshQueue() {
    if (typeof window === 'undefined' || !window.publish) {
      setStatus('IPC not available');
      return;
    }
    try {
      const list = await window.publish.list({ themeId: theme?.id });
      setQueueCount(Array.isArray(list) ? list.length : 0);
      setStatus('已刷新发布队列');
    } catch (error) {
      setStatus(`刷新失败: ${error.message || error}`);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">运营中心</h2>
      <p className="text-xs text-gray-500 mb-4">
        当前主题：{theme?.name || '未选择'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">发布队列</h3>
          <div className="text-xs text-gray-500 mb-3">占位：待发布任务列表。</div>
          <button
            type="button"
            onClick={handleRefreshQueue}
            className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
          >
            刷新发布队列
          </button>
          {queueCount !== null && (
            <div className="mt-2 text-[11px] text-gray-500">当前队列: {queueCount}</div>
          )}
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">互动与数据</h3>
          <div className="text-xs text-gray-500">占位：评论互动与数据趋势。</div>
        </div>
      </div>
      {status && <div className="mt-3 text-[11px] text-gray-400">{status}</div>}
    </div>
  );
}

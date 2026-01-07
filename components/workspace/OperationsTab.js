export default function OperationsTab({ theme }) {
  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">运营中心</h2>
      <p className="text-xs text-gray-500 mb-4">
        当前主题：{theme?.name || '未选择'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">发布队列</h3>
          <div className="text-xs text-gray-500">占位：待发布任务列表。</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">互动与数据</h3>
          <div className="text-xs text-gray-500">占位：评论互动与数据趋势。</div>
        </div>
      </div>
    </div>
  );
}

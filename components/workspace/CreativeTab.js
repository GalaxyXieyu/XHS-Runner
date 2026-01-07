export default function CreativeTab({ theme }) {
  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">创作实验室</h2>
      <p className="text-xs text-gray-500 mb-4">
        当前主题：{theme?.name || '未选择'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">输入配置</h3>
          <div className="text-xs text-gray-500">占位：选择参考笔记、配置模型参数。</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">生成结果</h3>
          <div className="text-xs text-gray-500">占位：文案与素材预览区域。</div>
        </div>
      </div>
    </div>
  );
}

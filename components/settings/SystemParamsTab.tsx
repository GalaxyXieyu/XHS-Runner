import { useState } from 'react';
import { Save } from 'lucide-react';

export function SystemParamsTab() {
  const [systemParams, setSystemParams] = useState({
    cleanThreshold: 100,
    monitorFreq: 'hourly',
    dataRetention: '30',
    autoReply: true,
    competitorMonitor: true,
    autoClean: true
  });

  return (
    <div className="space-y-6">
      {/* 基础参数 */}
      <section>
        <h3 className="text-xs font-medium text-gray-900 mb-3">基础参数</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">自动清理阈值</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={systemParams.cleanThreshold}
                onChange={(e) => setSystemParams({ ...systemParams, cleanThreshold: parseInt(e.target.value) })}
                className="w-20 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
              <span className="text-xs text-gray-500">阅读量</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">发布24小时后，低于此值将自动隐藏</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">数据监控频率</label>
            <select
              value={systemParams.monitorFreq}
              onChange={(e) => setSystemParams({ ...systemParams, monitorFreq: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors bg-white"
            >
              <option value="hourly">每小时</option>
              <option value="4hours">每4小时</option>
              <option value="daily">每天</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">定时抓取数据和分析竞品动态</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">数据保留时长</label>
            <select
              value={systemParams.dataRetention}
              onChange={(e) => setSystemParams({ ...systemParams, dataRetention: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors bg-white"
            >
              <option value="30">30天</option>
              <option value="60">60天</option>
              <option value="90">90天</option>
              <option value="forever">永久保留</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1">历史数据和笔记的保留期限</p>
          </div>
        </div>
      </section>

      {/* 自动化功能 */}
      <section>
        <h3 className="text-xs font-medium text-gray-900 mb-3">自动化功能</h3>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
            <input
              type="checkbox"
              checked={systemParams.autoReply}
              onChange={(e) => setSystemParams({ ...systemParams, autoReply: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded mt-0.5 focus:ring-blue-500/20"
            />
            <div>
              <div className="text-xs font-medium text-gray-900">启用自动回复</div>
              <div className="text-[11px] text-gray-500 mt-0.5">自动回复笔记评论，提升互动率</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
            <input
              type="checkbox"
              checked={systemParams.competitorMonitor}
              onChange={(e) => setSystemParams({ ...systemParams, competitorMonitor: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded mt-0.5 focus:ring-blue-500/20"
            />
            <div>
              <div className="text-xs font-medium text-gray-900">启用竞品监控</div>
              <div className="text-[11px] text-gray-500 mt-0.5">每日自动抓取竞品账号的最新笔记</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
            <input
              type="checkbox"
              checked={systemParams.autoClean}
              onChange={(e) => setSystemParams({ ...systemParams, autoClean: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded mt-0.5 focus:ring-blue-500/20"
            />
            <div>
              <div className="text-xs font-medium text-gray-900">启用自动清理</div>
              <div className="text-[11px] text-gray-500 mt-0.5">低质量内容达到阈值后自动删除或隐藏</div>
            </div>
          </label>
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="pt-4 border-t border-gray-200">
        <button className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Save className="w-4 h-4" />
          保存设置
        </button>
      </div>
    </div>
  );
}

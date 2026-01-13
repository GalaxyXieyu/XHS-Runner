import { useState } from 'react';
import { Save, MessageSquare, Eye, Trash2 } from 'lucide-react';

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
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          基础参数
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">自动清理阈值</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={systemParams.cleanThreshold}
                onChange={(e) => setSystemParams({ ...systemParams, cleanThreshold: parseInt(e.target.value) })}
                className="w-24 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
              />
              <span className="text-xs text-gray-500">阅读量</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">发布24小时后，低于此值将自动隐藏</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">数据监控频率</label>
            <select
              value={systemParams.monitorFreq}
              onChange={(e) => setSystemParams({ ...systemParams, monitorFreq: e.target.value })}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all bg-white"
            >
              <option value="hourly">每小时</option>
              <option value="4hours">每4小时</option>
              <option value="daily">每天</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1">定时抓取数据和分析竞品动态</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">数据保留时长</label>
            <select
              value={systemParams.dataRetention}
              onChange={(e) => setSystemParams({ ...systemParams, dataRetention: e.target.value })}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all bg-white"
            >
              <option value="30">30天</option>
              <option value="60">60天</option>
              <option value="90">90天</option>
              <option value="forever">永久保留</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1">历史数据和笔记的保留期限</p>
          </div>
        </div>
      </div>

      {/* 自动化功能 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          自动化功能
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
            systemParams.autoReply
              ? 'bg-emerald-50/50 border-emerald-200'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="checkbox"
              checked={systemParams.autoReply}
              onChange={(e) => setSystemParams({ ...systemParams, autoReply: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              systemParams.autoReply ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-900">自动回复</div>
                <div className={`w-8 h-4 rounded-full transition-colors ${systemParams.autoReply ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${systemParams.autoReply ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">自动回复笔记评论，提升互动率</div>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
            systemParams.competitorMonitor
              ? 'bg-blue-50/50 border-blue-200'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="checkbox"
              checked={systemParams.competitorMonitor}
              onChange={(e) => setSystemParams({ ...systemParams, competitorMonitor: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              systemParams.competitorMonitor ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <Eye className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-900">竞品监控</div>
                <div className={`w-8 h-4 rounded-full transition-colors ${systemParams.competitorMonitor ? 'bg-blue-500' : 'bg-gray-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${systemParams.competitorMonitor ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">每日自动抓取竞品账号的最新笔记</div>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
            systemParams.autoClean
              ? 'bg-amber-50/50 border-amber-200'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="checkbox"
              checked={systemParams.autoClean}
              onChange={(e) => setSystemParams({ ...systemParams, autoClean: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              systemParams.autoClean ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-900">自动清理</div>
                <div className={`w-8 h-4 rounded-full transition-colors ${systemParams.autoClean ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${systemParams.autoClean ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">低质量内容达到阈值后自动删除</div>
            </div>
          </label>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="pt-4 border-t border-gray-100">
        <button className="h-9 px-4 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />
          保存设置
        </button>
      </div>
    </div>
  );
}

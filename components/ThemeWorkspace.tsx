import { useState } from 'react';
import { Lightbulb, Sparkles, BarChart3 } from 'lucide-react';
import type { Theme } from '../App';
import { InsightTab } from './workspace/InsightTab';
import { CreativeTab } from './workspace/CreativeTab';
import { OperationsTab } from './workspace/OperationsTab';

interface ThemeWorkspaceProps {
  theme: Theme;
}

export function ThemeWorkspace({ theme }: ThemeWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'insight' | 'creative' | 'operations'>('insight');

  const tabs = [
    {
      id: 'insight' as const,
      label: '洞察与灵感',
      icon: Lightbulb,
      description: '数据分析 · 竞品监控 · 热词挖掘'
    },
    {
      id: 'creative' as const,
      label: '创作实验室',
      icon: Sparkles,
      description: 'AI生成 · 内容创作 · 素材管理'
    },
    {
      id: 'operations' as const,
      label: '运营中心',
      icon: BarChart3,
      description: '发布管理 · 互动回复 · 数据监控'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Theme Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-900">{theme.name}</h2>
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                运营中
              </span>
            </div>
            <p className="text-gray-600 mb-4">{theme.description}</p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">关键词:</span>
                <div className="flex flex-wrap gap-1">
                  {theme.keywords.map((keyword, idx) => (
                    <span key={idx} className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded-lg">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              {theme.competitors.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">监控竞品:</span>
                  <span className="text-sm text-gray-700">{theme.competitors.length} 个账号</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-6 py-4 flex flex-col items-center gap-2 transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-b from-red-50 to-white border-b-2 border-red-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-6 h-6 ${activeTab === tab.id ? 'text-red-500' : 'text-gray-400'}`} />
                <div className="text-center">
                  <div className={`font-medium ${activeTab === tab.id ? 'text-red-500' : 'text-gray-700'}`}>
                    {tab.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'insight' && <InsightTab theme={theme} />}
          {activeTab === 'creative' && <CreativeTab theme={theme} />}
          {activeTab === 'operations' && <OperationsTab theme={theme} />}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { FolderKanban, Sparkles, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { ThemeManagement } from './components/ThemeManagement';
import { CreativeTab } from './components/workspace/CreativeTab';
import { OperationsTab } from './components/workspace/OperationsTab';
import { Settings } from './components/Settings';

export interface Theme {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  competitors: string[];
  createdAt: string;
  status: 'active' | 'paused' | 'completed';
}

export default function App() {
  const [currentView, setCurrentView] = useState<'themes' | 'creative' | 'operations' | 'settings'>('themes');
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [themes, setThemes] = useState<Theme[]>([
    {
      id: '1',
      name: '2024夏季防晒攻略',
      description: '针对夏季防晒产品的深度测评与推荐',
      keywords: ['防晒', '夏季护肤', '防晒霜测评'],
      competitors: ['美妆博主A', '护肤达人B'],
      createdAt: '2024-06-15',
      status: 'active'
    },
    {
      id: '2',
      name: '秋冬护肤指南',
      description: '秋冬季节护肤产品推荐',
      keywords: ['秋冬护肤', '保湿', '补水'],
      competitors: ['护肤专家C'],
      createdAt: '2024-09-01',
      status: 'active'
    },
    {
      id: '3',
      name: '平价美妆测评',
      description: '学生党友好的平价美妆产品',
      keywords: ['平价美妆', '学生党', '性价比'],
      competitors: ['平价美妆博主'],
      createdAt: '2024-08-10',
      status: 'paused'
    }
  ]);

  const navItems = [
    { id: 'themes' as const, label: '主题管理', icon: FolderKanban },
    { id: 'creative' as const, label: '内容创作', icon: Sparkles },
    { id: 'operations' as const, label: '运营中心', icon: BarChart3 },
    { id: 'settings' as const, label: '系统设置', icon: SettingsIcon }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-12 px-3 border-b border-gray-200 flex items-center gap-2">
          <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">小</span>
          </div>
          <span className="text-xs font-bold text-gray-900">小红书运营系统</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  currentView === item.id
                    ? 'bg-red-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium text-gray-900">
              {navItems.find(item => item.id === currentView)?.label}
            </h1>
            {selectedTheme && currentView !== 'themes' && currentView !== 'settings' && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-xs text-gray-600">{selectedTheme.name}</span>
              </>
            )}
          </div>
          {selectedTheme && currentView !== 'themes' && currentView !== 'settings' && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{selectedTheme.keywords.length} 个关键词</span>
              <span>·</span>
              <span>{selectedTheme.competitors.length} 个竞品</span>
            </div>
          )}
        </header>

        {/* Content Area */}
        <div className="h-[calc(100vh-3rem)]">
          {currentView === 'themes' && (
            <ThemeManagement 
              themes={themes}
              setThemes={setThemes}
              selectedTheme={selectedTheme}
              setSelectedTheme={setSelectedTheme}
            />
          )}
          {currentView === 'creative' && selectedTheme && <CreativeTab theme={selectedTheme} />}
          {currentView === 'operations' && selectedTheme && <OperationsTab theme={selectedTheme} />}
          {currentView === 'settings' && <Settings />}
          
          {!selectedTheme && currentView !== 'themes' && currentView !== 'settings' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <div className="text-sm text-gray-600 mb-2">请先在主题管理中选择一个主题</div>
                <button
                  onClick={() => setCurrentView('themes')}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  前往主题管理
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

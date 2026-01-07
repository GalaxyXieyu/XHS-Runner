import { useState } from 'react';
import ThemeManagement from '../components/ThemeManagement';
import CreativeTab from '../components/workspace/CreativeTab';
import OperationsTab from '../components/workspace/OperationsTab';
import SettingsPanel from '../components/SettingsPanel';

const sampleThemes = [
  {
    id: '1',
    name: '2024夏季防晒攻略',
    description: '针对夏季防晒产品的深度测评与推荐',
    keywords: ['防晒', '夏季护肤', '防晒霜测评'],
    status: 'active',
  },
  {
    id: '2',
    name: '秋冬护肤指南',
    description: '秋冬季节护肤产品推荐',
    keywords: ['秋冬护肤', '保湿', '补水'],
    status: 'active',
  },
  {
    id: '3',
    name: '平价美妆测评',
    description: '学生党友好的平价美妆产品',
    keywords: ['平价美妆', '学生党', '性价比'],
    status: 'paused',
  },
];

const navItems = [
  { id: 'themes', label: '主题管理' },
  { id: 'creative', label: '内容创作' },
  { id: 'operations', label: '运营中心' },
  { id: 'settings', label: '系统设置' },
];

export default function Home() {
  const [currentView, setCurrentView] = useState('themes');
  const [themes] = useState(sampleThemes);
  const [selectedTheme, setSelectedTheme] = useState(sampleThemes[0]);

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-12 px-3 border-b border-gray-200 flex items-center gap-2">
          <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">小</span>
          </div>
          <span className="text-xs font-bold text-gray-900">小红书运营系统</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                currentView === item.id
                  ? 'bg-red-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium text-gray-900">
              {navItems.find((item) => item.id === currentView)?.label}
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
              <span>{selectedTheme.status}</span>
            </div>
          )}
        </header>

        <div className="h-[calc(100vh-3rem)]">
          {currentView === 'themes' && (
            <ThemeManagement
              themes={themes}
              selectedThemeId={selectedTheme?.id}
              onSelectTheme={setSelectedTheme}
            />
          )}
          {currentView === 'creative' && selectedTheme && <CreativeTab theme={selectedTheme} />}
          {currentView === 'operations' && selectedTheme && <OperationsTab theme={selectedTheme} />}
          {currentView === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}

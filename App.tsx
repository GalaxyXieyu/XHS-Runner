import { useState, useEffect } from 'react';
import { FolderKanban, Sparkles, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { ThemeManagement } from './components/ThemeManagement';
import { CreativeTab } from './components/workspace/CreativeTab';
import { OperationsTab } from './components/workspace/OperationsTab';
import { SettingsTab } from './components/workspace/SettingsTab';

export interface Keyword {
  id: number;
  value: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  keywords: Keyword[];
  competitors: string[];
  config?: {
    goal?: string;
    persona?: string;
    tone?: string;
    contentTypes?: string[];
    forbiddenTags?: string[];
    promptProfileId?: number;
    dailyOutputCount?: number;
    minQualityScore?: number;
  } | null;
  createdAt: string;
  status: 'active' | 'paused' | 'completed';
}

function transformTheme(t: any): Theme {
  return {
    id: String(t.id),
    name: t.name,
    description: t.description || '',
    keywords: (t.keywords || []).map((k: any) => ({
      id: k.id,
      value: k.value || k,
    })),
    competitors: (t.competitors || []).map((c: any) => c.name || c),
    config: t.config || null,
    createdAt: t.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    status: t.status || 'active',
  };
}

export default function App() {
  const [currentView, setCurrentView] = useState<'themes' | 'creative' | 'operations' | 'settings'>('themes');
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    try {
      let data: any[];
      if (window.themes) {
        data = await window.themes.list();
      } else {
        const res = await fetch('/api/themes');
        data = await res.json();
      }
      setThemes(data.map(transformTheme));
    } catch (e) {
      console.error('Failed to load themes:', e);
    } finally {
      setLoading(false);
    }
  };

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
              onRefresh={loadThemes}
            />
          )}
          {currentView === 'creative' && selectedTheme && (
            <CreativeTab
              theme={selectedTheme}
              themes={themes}
              onSelectTheme={(id) => {
                const next = themes.find((item) => String(item.id) === String(id));
                if (next) {
                  setSelectedTheme(next);
                }
              }}
            />
          )}
          {currentView === 'operations' && selectedTheme && <OperationsTab theme={selectedTheme} />}
          {currentView === 'settings' && <SettingsTab theme={selectedTheme!} />}
          
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

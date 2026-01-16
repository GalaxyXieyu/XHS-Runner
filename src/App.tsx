import { useState, useEffect } from 'react';
import { FolderKanban, Sparkles, BarChart3, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, ListChecks } from 'lucide-react';
import { ThemeManagement } from './components/ThemeManagement';
import { CreativeTab } from '@/features/workspace/components/CreativeTab';
import { OperationsTab } from '@/features/workspace/components/OperationsTab';
import { SettingsTab } from '@/features/workspace/components/SettingsTab';
import { TaskCenterPage } from '@/features/task-center/TaskCenterPage';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { LoginRequiredDialog } from '@/components/LoginRequiredDialog';

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

type ViewId = 'themes' | 'creative' | 'operations' | 'settings' | 'taskCenter';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewId>('themes');
  const [mountedViews, setMountedViews] = useState<Set<ViewId>>(() => new Set(['themes']));
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const auth = useAuthStatus();
  const showLoginDialog = !auth.isChecking && !auth.isLoggedIn;

  useEffect(() => {
    loadThemes();
  }, []);

  useEffect(() => {
    setMountedViews((prev) => {
      if (prev.has(currentView)) return prev;
      const next = new Set(prev);
      next.add(currentView);
      return next;
    });
  }, [currentView]);

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
    { id: 'taskCenter' as const, label: '任务中心', icon: ListChecks },
    { id: 'settings' as const, label: '系统设置', icon: SettingsIcon }
  ];

  const isViewMounted = (view: ViewId) => mountedViews.has(view) || currentView === view;

  const handleJumpToTheme = (themeId: string) => {
    const target = themes.find((theme) => theme.id === themeId);
    if (target) setSelectedTheme(target);
    setCurrentView('themes');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-12' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className={`h-12 border-b border-gray-200 flex items-center ${
          sidebarCollapsed ? 'justify-center px-0' : 'px-3 gap-2'
        }`}>
          <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">小</span>
          </div>
          {!sidebarCollapsed && (
            <span className="text-xs font-bold text-gray-900">小红书运营系统</span>
          )}
          {/* Collapse Button */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`ml-auto p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ${
              sidebarCollapsed ? 'hidden' : ''
            }`}
            title="收起侧边栏"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 min-h-0 overflow-y-auto p-2 space-y-1 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  sidebarCollapsed ? 'justify-center w-8 h-8' : 'w-full'
                } ${
                  currentView === item.id
                    ? 'bg-red-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-2 border-t border-gray-200 shrink-0">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
              sidebarCollapsed ? 'h-8 w-8' : ''
            } ${
              sidebarCollapsed
                ? 'text-gray-500 hover:bg-gray-100'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span>收起</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium text-gray-900">
              {navItems.find(item => item.id === currentView)?.label}
            </h1>
            {selectedTheme && currentView !== 'themes' && currentView !== 'settings' && currentView !== 'taskCenter' && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-xs text-gray-600">{selectedTheme.name}</span>
              </>
            )}
          </div>
          {selectedTheme && currentView !== 'themes' && currentView !== 'settings' && currentView !== 'taskCenter' && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{selectedTheme.keywords.length} 个关键词</span>
              <span>·</span>
              <span>{selectedTheme.competitors.length} 个竞品</span>
            </div>
          )}
        </header>

        {/* Content Area */}
        <div className="h-[calc(100vh-3rem)]">
          {isViewMounted('themes') && (
            <div className={currentView === 'themes' ? 'h-full' : 'hidden'}>
              <ThemeManagement
                themes={themes}
                setThemes={setThemes}
                selectedTheme={selectedTheme}
                setSelectedTheme={setSelectedTheme}
                onRefresh={loadThemes}
              />
            </div>
          )}
          {isViewMounted('creative') && selectedTheme && (
            <div className={currentView === 'creative' ? 'h-full' : 'hidden'}>
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
            </div>
          )}
          {isViewMounted('operations') && selectedTheme && (
            <div className={currentView === 'operations' ? 'h-full' : 'hidden'}>
              <OperationsTab theme={selectedTheme} />
            </div>
          )}
          {isViewMounted('settings') && (
            <div className={currentView === 'settings' ? 'h-full' : 'hidden'}>
              <SettingsTab
                theme={selectedTheme!}
                auth={{
                  status: auth.status,
                  isLoggedIn: auth.isLoggedIn,
                  isChecking: auth.isChecking,
                  isLoggingIn: auth.isLoggingIn,
                  error: auth.error,
                  qrCodeUrl: auth.qrCodeUrl,
                  login: auth.login,
                  logout: auth.logout,
                  refreshQRCode: auth.refreshQRCode,
                }}
              />
            </div>
          )}
          {isViewMounted('taskCenter') && (
            <div className={currentView === 'taskCenter' ? 'h-full' : 'hidden'}>
              <div className="p-4 h-full bg-gray-50">
                <TaskCenterPage themes={themes} onJumpToTheme={handleJumpToTheme} />
              </div>
            </div>
          )}
          
          {!selectedTheme && currentView !== 'themes' && currentView !== 'settings' && currentView !== 'taskCenter' && (
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

      <LoginRequiredDialog
        open={showLoginDialog}
        status={auth.status}
        error={auth.error}
        qrCodeUrl={auth.qrCodeUrl}
        onLogin={auth.login}
        onRefreshQRCode={auth.refreshQRCode}
        onCancel={auth.cancelLogin}
      />
    </div>
  );
}

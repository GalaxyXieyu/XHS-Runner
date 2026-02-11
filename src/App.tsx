import { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderKanban, Sparkles, BarChart3, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, ListChecks, ChevronDown, Archive, Hash, Users, X } from 'lucide-react';
import { ThemeManagement } from './components/ThemeManagement';
import { CreativeTab } from '@/features/workspace/components/CreativeTab';
import { OperationsTab } from '@/features/workspace/components/OperationsTab';
import { SettingsTab } from '@/features/workspace/components/SettingsTab';
import { TaskCenterPage } from '@/features/task-center/TaskCenterPage';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { LoginRequiredDialog } from '@/components/LoginRequiredDialog';
import { ConversationHistory } from '@/features/agent/components/ConversationHistory';
import { useConversationStore } from '@/features/agent/store/conversationStore';
import { useAgentStreamStore } from '@/features/agent/store/agentStreamStore';

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

type OverviewTask = {
  id: number;
  theme_id: number | null;
  status: string;
  progress: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type OverviewJob = {
  id: number;
  name: string;
  job_type: string;
  theme_id: number | null;
  is_enabled: number | boolean;
  next_run_at: string | null;
  last_status: string | null;
};

const formatOverviewTime = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTaskStatusText = (status: string) => {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '生成中';
    case 'completed':
    case 'done':
      return '已完成';
    case 'failed':
      return '失败';
    case 'paused':
      return '已暂停';
    default:
      return status || '-';
  }
};

const getJobTypeLabel = (jobType: string) => {
  if (jobType === 'daily_generate') return '定时生成';
  if (jobType === 'capture_theme' || jobType === 'capture_keyword') return '抓取调度';
  return jobType || '-';
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewId>('themes');
  const [mountedViews, setMountedViews] = useState<Set<ViewId>>(() => new Set(['themes']));
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);

  // CreativeTab 子 tab 状态提升
  const [creativeMainTab, setCreativeMainTab] = useState<'generate' | 'library'>('generate');
  const [taskCenterFocus, setTaskCenterFocus] = useState<{
    tab?: 'schedule' | 'history';
    jobType?: 'all' | 'capture' | 'daily_generate';
    themeId?: string;
  } | null>(null);
  // 素材库数量（由 CreativeTab 回调更新）
  const [libraryCount, setLibraryCount] = useState(0);
  const [taskQuickOpen, setTaskQuickOpen] = useState(false);
  const [overviewTasks, setOverviewTasks] = useState<OverviewTask[]>([]);
  const [overviewJobs, setOverviewJobs] = useState<OverviewJob[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  const auth = useAuthStatus();
  const showLoginDialog = !auth.isChecking && !auth.isLoggedIn;
  const canLoadTaskOverview = !auth.isChecking && auth.isLoggedIn;

  // 对话历史相关
  const { conversationId, setConversationId } = useConversationStore();
  const { setMessages, resetStream } = useAgentStreamStore();

  // 加载历史对话
  const loadConversation = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error('Failed to load conversation');

      const data = await res.json();
      setConversationId(data.id);

      // 转换消息格式
      const loadedMessages = data.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        agent: msg.agent,
        events: msg.events,
        askUser: msg.askUser,
        askUserResponse: msg.askUserResponse,
      }));

      resetStream();
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, [resetStream, setMessages, setConversationId]);

  // 开始新对话
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    resetStream();
  }, [resetStream, setConversationId]);

  const themeNameMap = useMemo(() => {
    const map = new Map<number, string>();
    themes.forEach((theme) => map.set(Number(theme.id), theme.name));
    return map;
  }, [themes]);

  const loadTaskOverview = useCallback(
    async (isBackground = false) => {
      if (!canLoadTaskOverview) return;
      if (!isBackground) setOverviewLoading(true);

      let nextError = '';

      try {
        const params = new URLSearchParams();
        params.set('time_range', '7d');
        params.set('limit', '20');
        const res = await fetch(`/api/tasks?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || '加载生成任务失败');
        }
        setOverviewTasks(Array.isArray(data) ? data : []);
      } catch (error) {
        nextError = error instanceof Error ? error.message : '加载生成任务失败';
      }

      try {
        const res = await fetch('/api/jobs');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || '加载调度任务失败');
        }
        setOverviewJobs(Array.isArray(data) ? data : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载调度任务失败';
        nextError = nextError ? `${nextError}；${message}` : message;
      }

      setOverviewError(nextError);
      if (!isBackground) setOverviewLoading(false);
    },
    [canLoadTaskOverview]
  );

  useEffect(() => {
    loadThemes();
  }, []);

  useEffect(() => {
    if (!canLoadTaskOverview) return;
    loadTaskOverview();
  }, [canLoadTaskOverview, loadTaskOverview]);

  useEffect(() => {
    setMountedViews((prev) => {
      if (prev.has(currentView)) return prev;
      const next = new Set(prev);
      next.add(currentView);
      return next;
    });
  }, [currentView]);

  useEffect(() => {
    if (!canLoadTaskOverview) return;
    const hasRunning = overviewTasks.some((task) => task.status === 'running' || task.status === 'queued');
    if (!taskQuickOpen && !hasRunning) return;

    const interval = setInterval(() => {
      loadTaskOverview(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [canLoadTaskOverview, overviewTasks, taskQuickOpen, loadTaskOverview]);

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

  const runningTaskCount = useMemo(
    () => overviewTasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
    [overviewTasks]
  );
  const failedTaskCount = useMemo(
    () => overviewTasks.filter((task) => task.status === 'failed').length,
    [overviewTasks]
  );
  const latestOverviewTasks = useMemo(() => {
    return [...overviewTasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  }, [overviewTasks]);
  const latestOverviewJobs = useMemo(() => {
    return [...overviewJobs]
      .sort((a, b) => new Date(b.next_run_at || 0).getTime() - new Date(a.next_run_at || 0).getTime())
      .slice(0, 3);
  }, [overviewJobs]);
  const enabledJobCount = useMemo(
    () => overviewJobs.filter((job) => job.is_enabled === true || job.is_enabled === 1).length,
    [overviewJobs]
  );

  const isViewMounted = (view: ViewId) => mountedViews.has(view) || currentView === view;

  const handleJumpToTheme = (themeId: string) => {
    const target = themes.find((theme) => theme.id === themeId);
    if (target) setSelectedTheme(target);
    setCurrentView('themes');
  };

  const navigateToTaskCenter = (_taskIds?: number[], focus?: {
    tab?: 'schedule' | 'history';
    jobType?: 'all' | 'capture' | 'daily_generate';
    themeId?: string;
  }) => {
    setCurrentView('taskCenter');
    setTaskCenterFocus(focus ?? null);
  };

  const handleToggleTaskQuick = () => {
    setTaskQuickOpen((prev) => {
      const next = !prev;
      if (!prev) {
        if (!canLoadTaskOverview) {
          setOverviewLoading(false);
          setOverviewError('请先登录后查看任务概览');
        } else {
          void loadTaskOverview();
        }
      }
      return next;
    });
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
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-gray-900">
              {navItems.find(item => item.id === currentView)?.label}
            </h1>
            {/* 主题选择器 - 仅在需要主题的视图显示 */}
            {currentView !== 'themes' && currentView !== 'settings' && currentView !== 'taskCenter' && (
              <div className="relative">
                <button
                  onClick={() => setShowThemeDropdown(!showThemeDropdown)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <span className="text-gray-700 max-w-[120px] truncate">
                    {selectedTheme?.name || '选择主题'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                </button>
                {showThemeDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowThemeDropdown(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                      {themes.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setSelectedTheme(theme);
                            setShowThemeDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors ${
                            selectedTheme?.id === theme.id ? 'bg-red-50 text-red-600' : 'text-gray-700'
                          }`}
                        >
                          {theme.name}
                        </button>
                      ))}
                      {themes.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-400">暂无主题</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* 关键词和竞品信息 */}
            {selectedTheme && currentView !== 'themes' && currentView !== 'settings' && currentView !== 'taskCenter' && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {selectedTheme.keywords.length} 个关键词
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {selectedTheme.competitors.length} 个竞品
                </span>
              </div>
            )}
          </div>
          {/* 右侧按钮 - 仅在 creative 视图显示 */}
          {currentView === 'creative' && selectedTheme && (
            <div className="flex items-center gap-1.5">
              {/* 历史记录按钮 */}
              {creativeMainTab === 'generate' && (
                <ConversationHistory
                  themeId={selectedTheme.id}
                  currentConversationId={conversationId}
                  onSelect={loadConversation}
                  onNewConversation={startNewConversation}
                />
              )}
              {creativeMainTab !== 'generate' && (
                <button
                  onClick={() => setCreativeMainTab('generate')}
                  className="px-3 py-1.5 text-xs rounded-full font-medium transition-all bg-blue-50 text-blue-600 hover:bg-blue-100"
                >
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  返回创作
                </button>
              )}
              <button
                onClick={() => setCreativeMainTab('library')}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-all ${
                  creativeMainTab === 'library'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Archive className="w-3.5 h-3.5 inline mr-1" />
                素材库
                <span className="ml-1 text-[10px] opacity-60">{libraryCount}</span>
              </button>
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
                mainTab={creativeMainTab}
                onLibraryCountChange={setLibraryCount}
              />
            </div>
          )}
          {isViewMounted('operations') && selectedTheme && (
            <div className={currentView === 'operations' ? 'h-full' : 'hidden'}>
              <div className="p-4 h-full overflow-y-auto bg-gray-50">
                <OperationsTab theme={selectedTheme} />
              </div>
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
                <TaskCenterPage
                  themes={themes}
                  onJumpToTheme={handleJumpToTheme}
                  initialTab={taskCenterFocus?.tab}
                  initialJobTypeFilter={taskCenterFocus?.jobType}
                  initialThemeId={taskCenterFocus?.themeId}
                />
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

      <div className="fixed bottom-20 right-6 z-40">
        {taskQuickOpen && (
          <div className="absolute bottom-16 right-0 w-80 rounded-lg border border-gray-200 bg-white shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">任务概览</div>
              <button
                onClick={() => setTaskQuickOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                aria-label="关闭任务概览"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {overviewLoading ? (
              <div className="text-xs text-gray-500">加载中...</div>
            ) : (
              <>
                {overviewError && (
                  <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {overviewError}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-gray-500">进行中</div>
                    <div className="text-gray-900 font-semibold">{runningTaskCount}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-gray-500">失败</div>
                    <div className="text-gray-900 font-semibold">{failedTaskCount}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-gray-500">调度启用</div>
                    <div className="text-gray-900 font-semibold">{enabledJobCount}/{overviewJobs.length}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500 mb-1">最新生成任务</div>
                  {latestOverviewTasks.length === 0 ? (
                    <div className="text-xs text-gray-400">暂无生成任务</div>
                  ) : (
                    <div className="space-y-2">
                      {latestOverviewTasks.map((task) => {
                        const themeName = task.theme_id ? themeNameMap.get(task.theme_id) : null;
                        const showProgress = task.status === 'running' || task.status === 'queued';
                        const progressText = showProgress ? ` · ${task.progress ?? 0}%` : '';
                        return (
                          <div key={task.id} className="flex items-center justify-between text-xs">
                            <div className="text-gray-700 truncate max-w-[150px]">
                              {themeName ? `${themeName} 生成` : `任务 #${task.id}`}
                            </div>
                            <div className="text-gray-500">
                              {getTaskStatusText(task.status)}{progressText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500 mb-1">调度任务</div>
                  {latestOverviewJobs.length === 0 ? (
                    <div className="text-xs text-gray-400">暂无调度任务</div>
                  ) : (
                    <div className="space-y-2">
                      {latestOverviewJobs.map((job) => {
                        const enabled = job.is_enabled === true || job.is_enabled === 1;
                        const themeName = job.theme_id ? themeNameMap.get(job.theme_id) : null;
                        return (
                          <div key={job.id} className="flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="text-gray-700 truncate">
                                {job.name || themeName || `任务 #${job.id}`}
                              </div>
                              <div className="text-gray-400">
                                {getJobTypeLabel(job.job_type)} · 下次 {formatOverviewTime(job.next_run_at)}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded ${
                                enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {enabled ? '启用' : '暂停'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setTaskQuickOpen(false);
                    navigateToTaskCenter();
                  }}
                  className="mt-3 w-full px-3 py-2 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                >
                  前往任务中心
                </button>
              </>
            )}
          </div>
        )}

        <button
          onClick={handleToggleTaskQuick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg transition bg-red-500 text-white hover:bg-red-600"
        >
          <ListChecks className="w-4 h-4" />
          <span className="text-xs font-semibold">任务</span>
          {runningTaskCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-white text-red-600 rounded-full">
              {runningTaskCount}
            </span>
          )}
        </button>
      </div>

      <LoginRequiredDialog
        open={showLoginDialog}
        status={auth.status}
        error={auth.error}
        qrCodeUrl={auth.qrCodeUrl}
        verificationRound={auth.verificationRound}
        onLogin={auth.login}
        onRefreshQRCode={auth.refreshQRCode}
        onCancel={auth.cancelLogin}
        onImportCookies={auth.importCookies}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Archive,
  Activity,
  Zap,
  Wand2,
  Clock,
  Target,
  Database,
  Users,
  MessageSquare,
  Brain,
  Image as ImageIcon,
  TrendingUp,
  Plus,
  Calendar,
  Trash2,
  Search,
  Loader,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Bot,
  Check,
  X,
} from 'lucide-react';
import { Theme } from '../../App';
import { CompactPackageCard, ContentPackage } from './CompactPackageCard';
import { ContentPackageEditor } from './ContentPackageEditor';
import { AgentCreator } from './AgentCreator';

interface CreativeTabProps {
  theme: Theme;
  themes?: Theme[];
  onSelectTheme?: (themeId: string) => void;
}

interface AutoTask {
  id: string;
  name: string;
  schedule: string;
  config: {
    goal: 'collects' | 'comments' | 'followers';
    persona: string;
    tone: string;
    promptProfileId: string;
    imageModel: 'nanobanana' | 'jimeng';
    outputCount: number;
    minQualityScore: number;
  };
  status: 'active' | 'paused';
  lastRunAt?: string;
  nextRunAt: string;
  totalRuns: number;
  successfulRuns: number;
}

interface TaskExecution {
  id: string;
  taskId?: string;
  taskName: string;
  taskType: 'instant' | 'scheduled';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  progress: number;
  generatedCount: number;
  targetCount: number;
  errorMessage?: string;
}

interface PromptProfile {
  id: string;
  name: string;
  model: string;
  temperature: number;
}

function normalizeCreative(row: any): ContentPackage {
  return {
    id: String(row.id),
    titles: Array.isArray(row.titles) ? row.titles : [row.title || '未命名内容包'],
    selectedTitleIndex: row.selected_title_index || 0,
    content: row.content || row.body || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    coverImage: row.cover_image || row.coverImage,
    qualityScore: row.quality_score || row.qualityScore || 0,
    predictedMetrics: row.predicted_metrics || row.predictedMetrics || { likes: 0, collects: 0, comments: 0 },
    actualMetrics: row.actual_metrics || row.actualMetrics,
    rationale: row.rationale || '',
    status: row.status || 'draft',
    publishedAt: row.published_at || row.publishedAt,
    createdAt: row.created_at?.split('T')[0] || row.createdAt || new Date().toLocaleString('zh-CN'),
    imageModel: row.image_model || row.imageModel,
    source: row.source || 'manual',
    sourceName: row.source_name || row.sourceName || '手动创建',
  };
}

export function CreativeTab({ theme, themes, onSelectTheme }: CreativeTabProps) {
  const [mainTab, setMainTab] = useState<'generate' | 'library' | 'tasks'>('generate');
  const [generateMode, setGenerateMode] = useState<'instant' | 'idea' | 'scheduled' | 'agent'>('instant');
  const [taskStatusTab, setTaskStatusTab] = useState<'running' | 'completed' | 'failed'>('running');

  // 生成状态
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Idea 一键生成配置（独立于现有自动化小红书流程）
  const [ideaConfig, setIdeaConfig] = useState({
    idea: '',
    styleKeyOption: 'cozy' as 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom',
    customStyleKey: '',
    aspectRatio: '3:4' as '3:4' | '1:1' | '4:3',
    count: 4,
    model: 'nanobanana' as 'nanobanana' | 'jimeng',
  });
  const [ideaPreviewPrompts, setIdeaPreviewPrompts] = useState<string[]>([]);
  const [ideaPreviewLoading, setIdeaPreviewLoading] = useState(false);
  const [ideaPreviewError, setIdeaPreviewError] = useState('');

  // 选择状态
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // 弹窗状态
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<AutoTask | null>(null);
  const [editingPackage, setEditingPackage] = useState<ContentPackage | null>(null);
  const [showAgentCreator, setShowAgentCreator] = useState(false);

  // 数据状态
  const [allPackages, setAllPackages] = useState<ContentPackage[]>([]);
  const [currentSessionPackages, setCurrentSessionPackages] = useState<ContentPackage[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<AutoTask[]>([]);
  const [taskExecutions, setTaskExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选状态
  const [libraryFilter, setLibraryFilter] = useState({
    source: 'all',
    searchQuery: '',
  });

  // 即时生成配置
  const [instantConfig, setInstantConfig] = useState({
    input: '',
    goal: 'collects' as 'collects' | 'comments' | 'followers',
    persona: '25-35岁职场女性，追求实用与高效',
    tone: '干货/亲和',
    promptProfileId: '1',
    imageModel: 'nanobanana' as 'nanobanana' | 'jimeng',
    outputCount: 5,
    minQualityScore: 70,
  });

  // Prompt profiles (后续可从 API 获取)
  const promptProfiles: PromptProfile[] = [
    { id: '1', name: '通用图文-收藏优先', model: 'gpt-4.1-mini', temperature: 0.7 },
    { id: '2', name: '种草文案模板', model: 'gpt-4o', temperature: 0.8 },
    { id: '3', name: '评论互动回复', model: 'gpt-4.1-mini', temperature: 0.6 },
  ];

  // 加载内容包列表
  const loadCreatives = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(normalizeCreative) : [];
      setAllPackages(list);
    } catch (error) {
      console.error('Failed to load creatives:', error);
      setAllPackages([]);
    } finally {
      setLoading(false);
    }
  };

  // 加载任务列表
  const loadJobs = async () => {
    try {
      const res = await fetch(`/api/jobs?themeId=${theme.id}`);
      const data = await res.json();
      // 转换任务格式
      const tasks: AutoTask[] = Array.isArray(data) ? data.map((job: any) => ({
        id: String(job.id),
        name: job.name || job.description || '未命名任务',
        schedule: job.schedule || '手动执行',
        config: {
          goal: (job.config?.goal as 'collects' | 'comments' | 'followers') || 'collects',
          persona: job.config?.persona || '25-35岁职场女性',
          tone: job.config?.tone || '干货/亲和',
          promptProfileId: job.config?.prompt_profile_id || '1',
          imageModel: (job.config?.image_model as 'nanobanana' | 'jimeng') || 'nanobanana',
          outputCount: job.config?.output_count || 5,
          minQualityScore: job.config?.min_quality_score || 70,
        },
        status: job.status === 'active' ? 'active' : 'paused',
        lastRunAt: job.last_run_at,
        nextRunAt: job.next_run_at || new Date().toISOString(),
        totalRuns: job.total_runs || 0,
        successfulRuns: job.successful_runs || 0,
      })) : [];
      setScheduledTasks(tasks);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  useEffect(() => {
    loadCreatives();
    loadJobs();
  }, [theme.id]);

  // 筛选后的内容包
  const filteredPackages = useMemo(() => {
    return allPackages.filter(pkg => {
      const matchesSource = libraryFilter.source === 'all' || pkg.source === libraryFilter.source;
      const matchesSearch = !libraryFilter.searchQuery ||
        pkg.titles[pkg.selectedTitleIndex].toLowerCase().includes(libraryFilter.searchQuery.toLowerCase()) ||
        pkg.content.toLowerCase().includes(libraryFilter.searchQuery.toLowerCase());
      return matchesSource && matchesSearch;
    });
  }, [allPackages, libraryFilter]);

  // 任务执行筛选
  const runningTasks = taskExecutions.filter(e => e.status === 'running');
  const completedTasks = taskExecutions.filter(e => e.status === 'completed');
  const failedTasks = taskExecutions.filter(e => e.status === 'failed');

  const ideaStyleOptions = [
    { key: 'cozy', name: '温馨治愈' },
    { key: 'minimal', name: '极简设计' },
    { key: 'illustration', name: '手绘插画' },
    { key: 'ink', name: '水墨书法' },
    { key: 'anime', name: '日漫二次元' },
    { key: '3d', name: '3D立体' },
    { key: 'cyberpunk', name: '赛博朋克' },
    { key: 'photo', name: '真实摄影' },
    { key: 'custom', name: '自定义' },
  ] as const;

  const resolveIdeaStyleKey = () => {
    if (ideaConfig.styleKeyOption === 'custom') {
      return ideaConfig.customStyleKey.trim();
    }
    return ideaConfig.styleKeyOption;
  };

  const normalizePrompts = (prompts: unknown): string[] => {
    if (!Array.isArray(prompts)) return [];
    return prompts
      .filter((p) => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const handleIdeaPreview = async () => {
    if (!ideaConfig.idea.trim()) return;

    setIdeaPreviewLoading(true);
    setIdeaPreviewError('');

    const styleKey = resolveIdeaStyleKey() || 'cozy';
    try {
      const res = await fetch('/api/generate/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: ideaConfig.idea,
          styleKey,
          aspectRatio: ideaConfig.aspectRatio,
          count: ideaConfig.count,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const prompts = normalizePrompts(data?.prompts);
      if (prompts.length === 0) {
        throw new Error('LLM 未返回有效 prompts（可手动编辑后继续）');
      }

      setIdeaPreviewPrompts(prompts);
    } catch (error) {
      const message = error instanceof Error ? error.message : '预览失败';
      console.error('Idea preview failed:', message);
      setIdeaPreviewError(message);
      setIdeaPreviewPrompts((prev) => (prev.length > 0 ? prev : ['']));
    } finally {
      setIdeaPreviewLoading(false);
    }
  };

  const updateIdeaPrompt = (index: number, value: string) => {
    setIdeaPreviewPrompts((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const addIdeaPrompt = () => {
    setIdeaPreviewPrompts((prev) => [...prev, '']);
  };

  const removeIdeaPrompt = (index: number) => {
    setIdeaPreviewPrompts((prev) => prev.filter((_, i) => i !== index));
  };

  const moveIdeaPrompt = (index: number, direction: -1 | 1) => {
    setIdeaPreviewPrompts((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = tmp;
      return copy;
    });
  };

  // 即时生成处理
  const handleInstantGenerate = async () => {
    if (!instantConfig.input) return;

    setHasStartedGeneration(true);
    setGenerating(true);
    setCurrentSessionPackages([]);

    // 创建新的任务执行记录
    const newExecution: TaskExecution = {
      id: `exec-${Date.now()}`,
      taskName: instantConfig.input,
      taskType: 'instant',
      status: 'running',
      startTime: new Date().toLocaleString('zh-CN'),
      progress: 0,
      generatedCount: 0,
      targetCount: instantConfig.outputCount,
    };
    setTaskExecutions(prev => [newExecution, ...prev]);

    try {
      // 调用生成 API
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: instantConfig.input,
          model: instantConfig.imageModel,
          topicId: theme.id,
          templateKey: instantConfig.promptProfileId,
        }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // 更新任务状态
      setTaskExecutions(prev => prev.map(exec =>
        exec.id === newExecution.id
          ? { ...exec, status: 'completed', endTime: new Date().toLocaleString('zh-CN'), progress: 100, generatedCount: instantConfig.outputCount }
          : exec
      ));

      // 刷新内容包列表
      await loadCreatives();

      alert(`生成任务已提交！任务ID: ${data.taskId}`);

    } catch (error: any) {
      console.error('Generate failed:', error);
      setTaskExecutions(prev => prev.map(exec =>
        exec.id === newExecution.id
          ? { ...exec, status: 'failed', endTime: new Date().toLocaleString('zh-CN'), errorMessage: error.message || '生成失败' }
          : exec
      ));
      alert(`生成失败: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // 继续新建
  const handleContinueNew = () => {
    setHasStartedGeneration(false);
    setInstantConfig({ ...instantConfig, input: '' });
    setCurrentSessionPackages([]);
  };

  // 主题统计
  const themeStats = {
    keywords: theme.keywords?.length || 0,
    competitors: theme.competitors?.length || 0,
  };

  const availableThemes = themes && themes.length > 0 ? themes : [theme];

  return (
    <div className="h-full flex flex-col">
      {/* Header Tabs */}
      <div className="bg-white border border-gray-200 rounded p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setMainTab('generate')}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                mainTab === 'generate' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Sparkles className="w-4 h-4 inline mr-1.5" />
              内容生成
            </button>
            <button
              onClick={() => { setMainTab('library'); loadCreatives(); }}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                mainTab === 'library' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Archive className="w-4 h-4 inline mr-1.5" />
              素材库
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">{allPackages.length}</span>
            </button>
            <button
              onClick={() => { setMainTab('tasks'); loadJobs(); }}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                mainTab === 'tasks' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-1.5" />
              任务管理
              {runningTasks.length > 0 && (
                <span className="ml-1.5 px-1.5 bg-white/20 rounded text-xs">{runningTasks.length}</span>
              )}
            </button>
          </div>

          {mainTab === 'library' && selectedPackages.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">已选 {selectedPackages.length} 个</span>
              <button className="px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600">
                批量导出
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* ========== 内容生成 Tab ========== */}
        {mainTab === 'generate' && (
          <div className="flex gap-3 h-full">
            {/* 左侧配置面板 */}
            {hasStartedGeneration && (
              <div className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded p-3 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-gray-900">生成配置</h3>
                  <button
                    onClick={handleContinueNew}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    收起
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-gray-50 rounded">
                    <div className="text-gray-600 mb-1">主题</div>
                    <div className="font-medium">{instantConfig.input}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-gray-600 mb-0.5">目标</div>
                      <div className="font-medium text-xs">
                        {instantConfig.goal === 'collects' ? '收藏优先' : instantConfig.goal === 'comments' ? '评论优先' : '涨粉优先'}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-gray-600 mb-0.5">数量</div>
                      <div className="font-medium text-xs">{instantConfig.outputCount} 个</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleContinueNew}
                  className="w-full mt-4 px-3 py-2 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  继续新建
                </button>
              </div>
            )}

            {/* 右侧主内容区 */}
            <div className="flex-1 bg-white border border-gray-200 rounded overflow-hidden">
              {!hasStartedGeneration ? (
                <div className="h-full overflow-y-auto p-6">
                  <div className="max-w-3xl mx-auto">
                    <h2 className="text-xl font-medium text-gray-900 mb-6">创建内容生成任务</h2>

                    {/* 生成方式选择 */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">生成方式</label>
                      <div className="grid grid-cols-4 gap-4">
                        <button
                          onClick={() => setGenerateMode('instant')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            generateMode === 'instant' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Zap className={`w-6 h-6 mx-auto mb-2 ${generateMode === 'instant' ? 'text-red-500' : 'text-gray-400'}`} />
                          <div className={`text-sm font-medium ${generateMode === 'instant' ? 'text-red-700' : 'text-gray-700'}`}>
                            立即生成
                          </div>
                          <div className="text-xs text-gray-500 mt-1">输入主题即时生成</div>
                        </button>

                        <button
                          onClick={() => setGenerateMode('idea')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            generateMode === 'idea' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Wand2 className={`w-6 h-6 mx-auto mb-2 ${generateMode === 'idea' ? 'text-emerald-600' : 'text-gray-400'}`} />
                          <div className={`text-sm font-medium ${generateMode === 'idea' ? 'text-emerald-700' : 'text-gray-700'}`}>
                            Idea 一键生成
                          </div>
                          <div className="text-xs text-gray-500 mt-1">输入 idea 预览多图 prompts</div>
                        </button>

                        <button
                          onClick={() => setGenerateMode('scheduled')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            generateMode === 'scheduled' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Clock className={`w-6 h-6 mx-auto mb-2 ${generateMode === 'scheduled' ? 'text-red-500' : 'text-gray-400'}`} />
                          <div className={`text-sm font-medium ${generateMode === 'scheduled' ? 'text-red-700' : 'text-gray-700'}`}>
                            定时任务
                          </div>
                          <div className="text-xs text-gray-500 mt-1">设置自动生成计划</div>
                        </button>

                        <button
                          onClick={() => setGenerateMode('agent')}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            generateMode === 'agent' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Bot className={`w-6 h-6 mx-auto mb-2 ${generateMode === 'agent' ? 'text-red-500' : 'text-gray-400'}`} />
                          <div className={`text-sm font-medium ${generateMode === 'agent' ? 'text-red-700' : 'text-gray-700'}`}>
                            智能代理
                          </div>
                          <div className="text-xs text-gray-500 mt-1">使用智能代理生成内容</div>
                        </button>
                      </div>
                    </div>

                    {generateMode === 'instant' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            输入主题或关键词 <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={instantConfig.input}
                            onChange={(e) => setInstantConfig({ ...instantConfig, input: e.target.value })}
                            placeholder="例如：平价防晒霜推荐、学生党护肤攻略..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-2">
                              <Target className="w-3.5 h-3.5 inline mr-1" />
                              内容目标
                            </label>
                            <select
                              value={instantConfig.goal}
                              onChange={(e) => setInstantConfig({ ...instantConfig, goal: e.target.value as any })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <option value="collects">收藏优先</option>
                              <option value="comments">评论优先</option>
                              <option value="followers">涨粉优先</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm text-gray-700 mb-2">
                              <Database className="w-3.5 h-3.5 inline mr-1" />
                              生成数量
                            </label>
                            <input
                              type="number"
                              value={instantConfig.outputCount}
                              onChange={(e) => setInstantConfig({ ...instantConfig, outputCount: parseInt(e.target.value) || 1 })}
                              min={1}
                              max={10}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm text-gray-700 mb-2">
                            <Users className="w-3.5 h-3.5 inline mr-1" />
                            目标受众
                          </label>
                          <input
                            type="text"
                            value={instantConfig.persona}
                            onChange={(e) => setInstantConfig({ ...instantConfig, persona: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-gray-700 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                            内容语气
                          </label>
                          <input
                            type="text"
                            value={instantConfig.tone}
                            onChange={(e) => setInstantConfig({ ...instantConfig, tone: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-2">
                              <Brain className="w-3.5 h-3.5 inline mr-1" />
                              提示词模板
                            </label>
                            <select
                              value={instantConfig.promptProfileId}
                              onChange={(e) => setInstantConfig({ ...instantConfig, promptProfileId: e.target.value })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              {promptProfiles.map(profile => (
                                <option key={profile.id} value={profile.id}>{profile.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm text-gray-700 mb-2">
                              <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                              图像模型
                            </label>
                            <select
                              value={instantConfig.imageModel}
                              onChange={(e) => setInstantConfig({ ...instantConfig, imageModel: e.target.value as any })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <option value="nanobanana">Nanobanana</option>
                              <option value="jimeng">即梦</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm text-gray-700 mb-2">
                            <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                            最低质量分
                          </label>
                          <input
                            type="number"
                            value={instantConfig.minQualityScore}
                            onChange={(e) => setInstantConfig({ ...instantConfig, minQualityScore: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={100}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>

                        <button
                          onClick={handleInstantGenerate}
                          disabled={!instantConfig.input || generating}
                          className="w-full mt-6 px-6 py-3 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {generating ? (
                            <>
                              <Loader className="w-4 h-4 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              立即生成
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {generateMode === 'idea' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            输入 idea（用于生成多图 prompts） <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={ideaConfig.idea}
                            onChange={(e) => setIdeaConfig({ ...ideaConfig, idea: e.target.value })}
                            placeholder="例如：秋天的咖啡馆、通勤穿搭分享、周末露营清单..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <div className="mt-1 text-xs text-gray-500 flex items-center justify-between">
                            <span>预览失败时也可手动编辑 prompts 继续</span>
                            <span>{ideaConfig.idea.length} 字</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-2">风格</label>
                            <select
                              value={ideaConfig.styleKeyOption}
                              onChange={(e) => setIdeaConfig({ ...ideaConfig, styleKeyOption: e.target.value as any })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              {ideaStyleOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm text-gray-700 mb-2">比例</label>
                            <select
                              value={ideaConfig.aspectRatio}
                              onChange={(e) => setIdeaConfig({ ...ideaConfig, aspectRatio: e.target.value as any })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="3:4">3:4（小红书）</option>
                              <option value="1:1">1:1</option>
                              <option value="4:3">4:3</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-700 mb-2">数量</label>
                            <input
                              type="number"
                              value={ideaConfig.count}
                              onChange={(e) => setIdeaConfig({ ...ideaConfig, count: parseInt(e.target.value) || 1 })}
                              min={1}
                              max={9}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-gray-700 mb-2">图像模型</label>
                            <select
                              value={ideaConfig.model}
                              onChange={(e) => setIdeaConfig({ ...ideaConfig, model: e.target.value as any })}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="nanobanana">Nanobanana</option>
                              <option value="jimeng">即梦</option>
                            </select>
                          </div>
                        </div>

                        {ideaConfig.styleKeyOption === 'custom' && (
                          <div>
                            <label className="block text-sm text-gray-700 mb-2">自定义 styleKey</label>
                            <input
                              type="text"
                              value={ideaConfig.customStyleKey}
                              onChange={(e) => setIdeaConfig({ ...ideaConfig, customStyleKey: e.target.value })}
                              placeholder="例如：cozy（或任意自定义 key，若不存在将降级为默认）"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        )}

                        {ideaPreviewError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium">预览失败</div>
                              <div className="text-xs mt-0.5">{ideaPreviewError}</div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-700">
                            预览 prompts <span className="text-xs text-gray-500">({ideaPreviewPrompts.length})</span>
                          </div>
                          <button
                            onClick={handleIdeaPreview}
                            disabled={!ideaConfig.idea.trim() || ideaPreviewLoading}
                            className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {ideaPreviewLoading ? (
                              <>
                                <Loader className="w-4 h-4 animate-spin" />
                                预览中...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                生成预览
                              </>
                            )}
                          </button>
                        </div>

                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          {ideaPreviewPrompts.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">
                              点击「生成预览」后在这里编辑 prompts
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {ideaPreviewPrompts.map((prompt, idx) => (
                                <div key={idx} className="p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-gray-500">Prompt {idx + 1}</div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => moveIdeaPrompt(idx, -1)}
                                        disabled={idx === 0}
                                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                        title="上移"
                                      >
                                        <ChevronUp className="w-4 h-4 text-gray-500" />
                                      </button>
                                      <button
                                        onClick={() => moveIdeaPrompt(idx, 1)}
                                        disabled={idx === ideaPreviewPrompts.length - 1}
                                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                        title="下移"
                                      >
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                      </button>
                                      <button
                                        onClick={() => removeIdeaPrompt(idx)}
                                        className="p-1 rounded hover:bg-red-50"
                                        title="删除"
                                      >
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                      </button>
                                    </div>
                                  </div>
                                  <textarea
                                    value={prompt}
                                    onChange={(e) => updateIdeaPrompt(idx, e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <button
                            onClick={addIdeaPrompt}
                            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            新增 prompt
                          </button>
                          <div className="text-xs text-gray-500">下一步（确认生成）在后续任务中接入</div>
                        </div>
                      </div>
                    )}

                    {generateMode === 'agent' && (
                      <div className="h-full">
                        <AgentCreator
                          theme={theme}
                          onClose={() => setGenerateMode('instant')}
                        />
                      </div>
                    )}

                    {generateMode === 'scheduled' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-700">定时任务列表</div>
                          <button
                            onClick={() => setShowTaskForm(true)}
                            className="px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            新建
                          </button>
                        </div>

                        {scheduledTasks.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <div className="text-sm">暂无定时任务</div>
                            <div className="text-xs mt-1">创建任务后可自动生成内容</div>
                          </div>
                        ) : (
                          scheduledTasks.map(task => (
                            <div key={task.id} className="p-4 border border-gray-200 rounded-lg">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="text-sm font-medium text-gray-900 mb-1">{task.name}</div>
                                  <div className="text-xs text-gray-500 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {task.schedule}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {task.status === 'active' ? '运行中' : '已暂停'}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
                                <div>生成：{task.config.outputCount}个/次</div>
                                <div>质量：≥{task.config.minQualityScore}</div>
                                <div>成功率：{task.totalRuns > 0 ? Math.round((task.successfulRuns / task.totalRuns) * 100) : 0}%</div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingTask(task);
                                    setShowTaskForm(true);
                                  }}
                                  className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                                >
                                  编辑
                                </button>
                                <button className="flex-1 px-2 py-1 text-xs bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">
                                  {task.status === 'active' ? '暂停' : '启动'}
                                </button>
                                <button className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 定时任务编辑弹窗 */}
                    {showTaskForm && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
                          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                            <h3 className="text-base font-medium text-gray-900">
                              {editingTask ? '编辑定时任务' : '新建定时任务'}
                            </h3>
                            <button
                              onClick={() => {
                                setShowTaskForm(false);
                                setEditingTask(null);
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="p-6 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                任务名称 <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                defaultValue={editingTask?.name || ''}
                                placeholder="例如：防晒主题每日内容"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                执行计划 <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                defaultValue={editingTask?.schedule || ''}
                                placeholder="例如：每日 09:00"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                支持格式：每日 HH:MM、每周X HH:MM
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">内容目标</label>
                                <select
                                  defaultValue={editingTask?.config.goal || 'collects'}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  <option value="collects">收藏优先</option>
                                  <option value="comments">评论优先</option>
                                  <option value="followers">涨粉优先</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">生成数量</label>
                                <input
                                  type="number"
                                  defaultValue={editingTask?.config.outputCount || 5}
                                  min={1}
                                  max={20}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">目标受众</label>
                              <input
                                type="text"
                                defaultValue={editingTask?.config.persona || ''}
                                placeholder="例如：学生党、职场女性"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">内容语气</label>
                              <input
                                type="text"
                                defaultValue={editingTask?.config.tone || ''}
                                placeholder="例如：干货/种草"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">提示词模板</label>
                                <select
                                  defaultValue={editingTask?.config.promptProfileId || '1'}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  {promptProfiles.map(profile => (
                                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">图像模型</label>
                                <select
                                  defaultValue={editingTask?.config.imageModel || 'nanobanana'}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  <option value="nanobanana">Nanobanana</option>
                                  <option value="jimeng">即梦</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">最低质量分</label>
                              <input
                                type="number"
                                defaultValue={editingTask?.config.minQualityScore || 70}
                                min={0}
                                max={100}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>
                          </div>

                          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                            <button
                              onClick={() => {
                                setShowTaskForm(false);
                                setEditingTask(null);
                              }}
                              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => {
                                // TODO: 保存任务逻辑
                                setShowTaskForm(false);
                                setEditingTask(null);
                                loadJobs();
                              }}
                              className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                            >
                              {editingTask ? '保存修改' : '创建任务'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : generating ? (
                /* 生成进度 */
                <div className="flex flex-col items-center justify-center h-full p-8">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 border-4 border-gray-200 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-20 h-20 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-red-500" />
                  </div>
                  <div className="text-base font-medium text-gray-900 mb-2">AI 正在生成内容包</div>
                  <div className="text-sm text-gray-500 mb-6">
                    已生成 {runningTasks[0]?.generatedCount || 0}/{runningTasks[0]?.targetCount || 0} 个
                  </div>
                  <div className="w-80 bg-gray-200 rounded-full h-2 mb-4">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${runningTasks[0]?.progress || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">数据过滤 → 评分排序 → 聚类分组 → 生成内容</div>
                </div>
              ) : (
                /* 生成完成：显示结果 */
                <div className="p-4 overflow-y-auto h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          生成完成！共 {currentSessionPackages.length} 个内容包
                        </div>
                        <div className="text-xs text-gray-500">内容已保存到素材库</div>
                      </div>
                    </div>
                    <button
                      onClick={loadCreatives}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      刷新列表
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {currentSessionPackages.map(pkg => (
                      <CompactPackageCard
                        key={pkg.id}
                        pkg={pkg}
                        isSelected={selectedPackages.includes(pkg.id)}
                        onToggleSelect={(id) => {
                          setSelectedPackages(prev =>
                            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
                          );
                        }}
                        onTitleChange={() => {}}
                        onEdit={(id) => {
                          const pkg = currentSessionPackages.find(p => p.id === id);
                          if (pkg) setEditingPackage(pkg);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== 素材库 Tab ========== */}
        {mainTab === 'library' && (
          <div className="h-full flex flex-col">
            <div className="bg-white border border-gray-200 rounded p-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索内容..."
                    value={libraryFilter.searchQuery}
                    onChange={(e) => setLibraryFilter({ ...libraryFilter, searchQuery: e.target.value })}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
                <select
                  value={libraryFilter.source}
                  onChange={(e) => setLibraryFilter({ ...libraryFilter, source: e.target.value })}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="all">全部来源</option>
                  <option value="manual">手动生成</option>
                  {scheduledTasks.map(task => (
                    <option key={task.id} value={task.id}>{task.name}</option>
                  ))}
                </select>
                <div className="ml-auto text-xs text-gray-500">共 {filteredPackages.length} 个</div>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader className="w-8 h-8 text-gray-400 animate-spin" />
              </div>
            ) : filteredPackages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Archive className="w-12 h-12 text-gray-300 mb-3" />
                <div className="text-sm text-gray-900 mb-1">暂无内容包</div>
                <div className="text-xs text-gray-500">在内容生成中创建或等待定时任务生成</div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredPackages.map(pkg => (
                    <CompactPackageCard
                      key={pkg.id}
                      pkg={pkg}
                      isSelected={selectedPackages.includes(pkg.id)}
                      onToggleSelect={(id) => {
                        setSelectedPackages(prev =>
                          prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
                        );
                      }}
                      onTitleChange={() => {}}
                      onEdit={(id) => {
                        const pkg = allPackages.find(p => p.id === id);
                        if (pkg) setEditingPackage(pkg);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== 任务管理 Tab ========== */}
        {mainTab === 'tasks' && (
          <div className="h-full flex flex-col bg-white border border-gray-200 rounded overflow-hidden">
            <div className="border-b border-gray-200 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setTaskStatusTab('running')}
                    className={`px-3 py-1.5 text-xs rounded transition-all ${
                      taskStatusTab === 'running'
                        ? 'bg-blue-500 text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    正在进行 ({runningTasks.length})
                  </button>
                  <button
                    onClick={() => setTaskStatusTab('completed')}
                    className={`px-3 py-1.5 text-xs rounded transition-all ${
                      taskStatusTab === 'completed'
                        ? 'bg-green-500 text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    已完成 ({completedTasks.length})
                  </button>
                  <button
                    onClick={() => setTaskStatusTab('failed')}
                    className={`px-3 py-1.5 text-xs rounded transition-all ${
                      taskStatusTab === 'failed'
                        ? 'bg-red-500 text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    失败 ({failedTasks.length})
                  </button>
                </div>

                <div className="flex gap-2">
                  <select className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
                    <option>全部类型</option>
                    <option>立即生成</option>
                    <option>定时任务</option>
                  </select>
                  <select className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
                    <option>最近7天</option>
                    <option>最近30天</option>
                    <option>全部时间</option>
                  </select>
                </div>
              </div>

              {selectedTasks.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-600">已选 {selectedTasks.length} 条记录</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedTasks([])}
                      className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                    >
                      取消
                    </button>
                    <button className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                      批量删除
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {taskStatusTab === 'running' && (
                <div className="space-y-2">
                  {runningTasks.length > 0 ? (
                    runningTasks.map(task => (
                      <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-all">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTasks.includes(task.id)}
                            onChange={() => {
                              setSelectedTasks(prev =>
                                prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                              );
                            }}
                            className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                {task.taskType === 'instant' ? '立即生成' : '定时任务'}
                              </span>
                              <Loader className="w-3.5 h-3.5 text-blue-600 animate-spin ml-auto" />
                            </div>
                            <div className="text-xs text-gray-500 mb-2">
                              已生成 {task.generatedCount}/{task.targetCount} 个内容包
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                              <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>开始时间：{task.startTime}</span>
                              <span className="text-blue-600 font-medium">{task.progress}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Loader className="w-12 h-12 text-gray-300 mb-3" />
                      <div className="text-sm text-gray-900 mb-1">暂无正在进行的任务</div>
                      <div className="text-xs text-gray-500">开始生成后会显示在这里</div>
                    </div>
                  )}
                </div>
              )}

              {taskStatusTab === 'completed' && (
                <div className="space-y-2">
                  {completedTasks.length > 0 ? (
                    completedTasks.map(task => (
                      <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTasks.includes(task.id)}
                            onChange={() => {
                              setSelectedTasks(prev =>
                                prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                              );
                            }}
                            className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                  <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    {task.taskType === 'instant' ? '立即生成' : '定时任务'}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {task.startTime} - {task.endTime} · 生成 {task.generatedCount} 个
                                </div>
                              </div>
                              <button className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                查看结果
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <CheckCircle2 className="w-12 h-12 text-gray-300 mb-3" />
                      <div className="text-sm text-gray-900 mb-1">暂无已完成的任务</div>
                      <div className="text-xs text-gray-500">完成的任务会显示在这里</div>
                    </div>
                  )}
                </div>
              )}

              {taskStatusTab === 'failed' && (
                <div className="space-y-2">
                  {failedTasks.length > 0 ? (
                    failedTasks.map(task => (
                      <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-all">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTasks.includes(task.id)}
                            onChange={() => {
                              setSelectedTasks(prev =>
                                prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                              );
                            }}
                            className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                                </div>
                                <div className="text-xs text-gray-600 mb-1">
                                  {task.startTime} · 生成 {task.generatedCount}/{task.targetCount} 后失败
                                </div>
                                {task.errorMessage && (
                                  <div className="flex items-start gap-1 text-xs text-red-600">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    {task.errorMessage}
                                  </div>
                                )}
                              </div>
                              <button className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <RefreshCw className="w-3 h-3" />
                                重试
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <XCircle className="w-12 h-12 text-gray-300 mb-3" />
                      <div className="text-sm text-gray-900 mb-1">暂无失败的任务</div>
                      <div className="text-xs text-gray-500">失败的任务会显示在这里</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editingPackage && (
        <ContentPackageEditor
          pkg={editingPackage}
          onClose={() => setEditingPackage(null)}
          onSave={(updatedPkg) => {
            setAllPackages(prev => prev.map(p => p.id === updatedPkg.id ? updatedPkg : p));
            setCurrentSessionPackages(prev => prev.map(p => p.id === updatedPkg.id ? updatedPkg : p));
          }}
        />
      )}
    </div>
  );
}

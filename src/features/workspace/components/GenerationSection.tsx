import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import type { Theme } from '@/App';
import { AgentCreator } from '@/features/agent/components/AgentCreator';
import { ContentResultCard } from '@/features/material-library/components/ContentResultCard';
import { MaterialGallery } from '@/features/material-library/components/MaterialGallery';
import type { ContentPackage } from '@/features/material-library/types';
import type { AutoTask } from '@/features/task-management/types';

type IdeaConfig = {
  idea: string;
  styleKeyOption: 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom';
  customStyleKey: string;
  aspectRatio: '3:4' | '1:1' | '4:3';
  count: number;
  model: 'nanobanana' | 'jimeng';
  goal: 'collects' | 'comments' | 'followers';
  persona: string;
  tone: string;
  extraRequirements: string;
};

interface GenerationSectionProps {
  theme: Theme;
  generateMode: 'oneClick' | 'scheduled' | 'agent';
  setGenerateMode: (mode: 'oneClick' | 'scheduled' | 'agent') => void;
  ideaCreativeId: number | null;
  ideaTaskIds: number[];
  setIdeaCreativeId: (id: number | null) => void;
  setIdeaTaskIds: (ids: number[]) => void;
  ideaPollingError: string;
  ideaContentPackage: any;
  ideaConfig: IdeaConfig;
  setIdeaConfig: Dispatch<SetStateAction<IdeaConfig>>;
  ideaStyleOptions: ReadonlyArray<{ key: IdeaConfig['styleKeyOption']; name: string }>;
  ideaPreviewPrompts: string[];
  ideaPreviewLoading: boolean;
  ideaPreviewError: string;
  handleIdeaPreview: () => void;
  updateIdeaPrompt: (index: number, value: string) => void;
  removeIdeaPrompt: (index: number) => void;
  moveIdeaPrompt: (index: number, direction: -1 | 1) => void;
  addIdeaPrompt: () => void;
  showIdeaConfirmModal: boolean;
  setShowIdeaConfirmModal: (open: boolean) => void;
  sanitizeIdeaPromptsForConfirm: () => string[];
  resolveIdeaStyleKey: () => string;
  ideaConfirmError: string;
  setIdeaConfirmError: (value: string) => void;
  ideaConfirming: boolean;
  handleIdeaConfirm: () => void;
  scheduledTasks: AutoTask[];
  showTaskForm: boolean;
  setShowTaskForm: (open: boolean) => void;
  editingTask: AutoTask | null;
  setEditingTask: (task: AutoTask | null) => void;
  promptProfiles: ReadonlyArray<{ id: string; name: string }>;
  loadJobs: () => void;
  allPackages: ContentPackage[];
  setMainTab: (tab: 'generate' | 'library' | 'tasks') => void;
  setEditingPackage: (pkg: ContentPackage | null) => void;
}

export function GenerationSection({
  theme,
  generateMode,
  setGenerateMode,
  ideaCreativeId,
  ideaTaskIds,
  setIdeaCreativeId,
  setIdeaTaskIds,
  ideaPollingError,
  ideaContentPackage,
  ideaConfig,
  setIdeaConfig,
  ideaStyleOptions,
  ideaPreviewPrompts,
  ideaPreviewLoading,
  ideaPreviewError,
  handleIdeaPreview,
  updateIdeaPrompt,
  removeIdeaPrompt,
  moveIdeaPrompt,
  addIdeaPrompt,
  showIdeaConfirmModal,
  setShowIdeaConfirmModal,
  sanitizeIdeaPromptsForConfirm,
  resolveIdeaStyleKey,
  ideaConfirmError,
  setIdeaConfirmError,
  ideaConfirming,
  handleIdeaConfirm,
  scheduledTasks,
  showTaskForm,
  setShowTaskForm,
  editingTask,
  setEditingTask,
  promptProfiles,
  loadJobs,
  allPackages,
  setMainTab,
  setEditingPackage,
}: GenerationSectionProps) {
  const showDefaultLanding = generateMode === 'oneClick'
    && ideaCreativeId === null
    && !ideaConfig.idea.trim();

  const ideaResultPackage = useMemo(() => {
    if (!ideaContentPackage?.creative) return null;
    const creative = ideaContentPackage.creative;
    const rawTags = typeof creative.tags === 'string' ? creative.tags : '';
    const tags = rawTags.split(/[,#\\s]+/).map((tag: string) => tag.trim()).filter(Boolean);
    const title = creative.title || '未命名';
    const assets = Array.isArray(ideaContentPackage.assets) ? ideaContentPackage.assets : [];
    const coverImage = assets.length > 0 ? `/api/assets/${assets[0].id}` : undefined;
    return {
      id: String(creative.id ?? 'preview'),
      titles: [title],
      selectedTitleIndex: 0,
      content: creative.content || '',
      tags,
      coverImage,
      qualityScore: 0,
      predictedMetrics: { likes: 0, collects: 0, comments: 0 },
      rationale: '',
      status: 'draft' as const,
      createdAt: creative.createdAt ? new Date(creative.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN'),
      source: 'manual',
      sourceName: '立即生成',
      imageModel: creative.model || undefined,
    };
  }, [ideaContentPackage]);

  const featureCards = [
    { title: '无限画布', desc: '灵感无界 · 自由创作', icon: Sparkles },
    { title: '图片生成', desc: '智能美学提升', icon: Wand2 },
    { title: '视频生成', desc: '支持音画同步', icon: RefreshCw },
    { title: '数字人', desc: '大师级拟真', icon: Bot },
    { title: '动作模仿', desc: '灵感更灵动', icon: Sparkles },
  ];

  return (
    <div className="flex gap-3 h-full">
      {/* 右侧主内容区 */}
      <div className="flex-1 bg-white border border-gray-200 rounded overflow-hidden">
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            {!showDefaultLanding && (
              <h2 className="text-xl font-medium text-gray-900 mb-6">创建内容生成任务</h2>
            )}

            {/* 生成方式选择 - 隐藏，默认使用agent */}
            <div className="mb-6 hidden">
              <label className="block text-sm font-medium text-gray-700 mb-3">生成方式</label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => setGenerateMode('oneClick')}
                  className={`p-4 rounded-lg border-2 transition-all ${generateMode === 'oneClick' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <Wand2 className={`w-6 h-6 mx-auto mb-2 ${generateMode === 'oneClick' ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <div className={`text-sm font-medium ${generateMode === 'oneClick' ? 'text-emerald-700' : 'text-gray-700'}`}>
                    立即生成
                  </div>
                  <div className="text-xs text-gray-500 mt-1">输入 idea 预览/编辑多图 prompts</div>
                </button>

                <button
                  onClick={() => setGenerateMode('scheduled')}
                  className={`p-4 rounded-lg border-2 transition-all ${generateMode === 'scheduled' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
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
                  className={`p-4 rounded-lg border-2 transition-all ${generateMode === 'agent' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
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

            {showDefaultLanding && (
              <div className="space-y-6">
                <div className="text-center text-lg font-medium text-gray-800">
                  开启你的 <span className="text-sky-500">Agent 模式</span> 即刻造梦！
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex gap-4 items-start">
                    <div className="w-14 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xl">
                      +
                    </div>
                    <textarea
                      value={ideaConfig.idea}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, idea: e.target.value })}
                      placeholder="说说今天想做点什么"
                      rows={3}
                      className="flex-1 px-3 py-2 text-sm border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <button
                      className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
                      aria-label="发送"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setGenerateMode('agent')}
                      className="px-3 py-1.5 text-xs rounded-full border border-sky-200 text-sky-600 bg-sky-50 hover:bg-sky-100"
                    >
                      Agent 模式
                    </button>
                    <button
                      onClick={() => setGenerateMode('oneClick')}
                      className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100"
                    >
                      自动
                    </button>
                    <button className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">
                      灵感搜索
                    </button>
                    <button className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">
                      创意设计
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {featureCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.title}
                        className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{card.title}</div>
                          <div className="text-xs text-gray-500">{card.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {generateMode === 'oneClick' && !showDefaultLanding && (
              <div className="space-y-4">
                {ideaCreativeId !== null && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">已提交生成任务</div>
                      <div className="text-xs mt-0.5">
                        creativeId: {ideaCreativeId}，taskIds: {ideaTaskIds.length} 个
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIdeaCreativeId(null);
                        setIdeaTaskIds([]);
                      }}
                      className="text-xs text-emerald-700 hover:text-emerald-900"
                    >
                      重新开始
                    </button>
                  </div>
                )}

                {ideaCreativeId !== null && (
                  <div className="space-y-3">
                    {ideaPollingError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">进度轮询失败：{ideaPollingError}</div>
                      </div>
                    )}

                    {ideaContentPackage && (
                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-gray-800">生成进度</div>
                          <div className="text-xs text-gray-500">
                            {Array.isArray(ideaContentPackage?.tasks) ? ideaContentPackage.tasks.filter((t: any) => t?.status === 'done').length : 0}
                            /
                            {Array.isArray(ideaContentPackage?.tasks) ? ideaContentPackage.tasks.length : 0}
                            已完成
                          </div>
                        </div>

                        <div className="w-full h-2 bg-gray-100 rounded overflow-hidden mb-3">
                          <div
                            className="h-full bg-emerald-500"
                            style={{
                              width: `${(() => {
                                const total = Array.isArray(ideaContentPackage?.tasks) ? ideaContentPackage.tasks.length : 0;
                                const done = Array.isArray(ideaContentPackage?.tasks) ? ideaContentPackage.tasks.filter((t: any) => t?.status === 'done' || t?.status === 'failed').length : 0;
                                return total > 0 ? Math.round((done / total) * 100) : 0;
                              })()}%`,
                            }}
                          />
                        </div>

                        {Array.isArray(ideaContentPackage?.tasks) && ideaContentPackage.tasks.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {ideaContentPackage.tasks.slice(0, 6).map((t: any) => (
                              <div key={String(t.id)} className="flex items-center gap-1 text-gray-600">
                                {t.status === 'done' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                ) : t.status === 'failed' ? (
                                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                                ) : (
                                  <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                )}
                                <span className="truncate">{t.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {ideaResultPackage && (
                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <div className="text-sm font-medium text-gray-800 mb-2">生成结果</div>
                        <ContentResultCard pkg={ideaResultPackage} />
                      </div>
                    )}
                  </div>
                )}

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

                <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="text-sm font-medium text-gray-700 mb-2">参数（影响 prompts 质量）</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">内容目标</label>
                      <select
                        value={ideaConfig.goal}
                        onChange={(e) => setIdeaConfig({ ...ideaConfig, goal: e.target.value as IdeaConfig['goal'] })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="collects">收藏优先</option>
                        <option value="comments">评论优先</option>
                        <option value="followers">涨粉优先</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">内容语气</label>
                      <input
                        type="text"
                        value={ideaConfig.tone}
                        onChange={(e) => setIdeaConfig({ ...ideaConfig, tone: e.target.value })}
                        placeholder="例如：干货/亲和、犀利吐槽、温柔治愈"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm text-gray-700 mb-2">目标受众</label>
                    <input
                      type="text"
                      value={ideaConfig.persona}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, persona: e.target.value })}
                      placeholder="例如：学生党、职场女性、宝妈、露营新手"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm text-gray-700 mb-2">额外要求（可选）</label>
                    <textarea
                      value={ideaConfig.extraRequirements}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, extraRequirements: e.target.value })}
                      placeholder="例如：不要出现品牌 logo；画面更极简；避免手部特写"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">风格</label>
                    <select
                      value={ideaConfig.styleKeyOption}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, styleKeyOption: e.target.value as IdeaConfig['styleKeyOption'] })}
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
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, aspectRatio: e.target.value as IdeaConfig['aspectRatio'] })}
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
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, model: e.target.value as IdeaConfig['model'] })}
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

                  <button
                    onClick={() => {
                      setIdeaConfirmError('');
                      setShowIdeaConfirmModal(true);
                    }}
                    disabled={ideaCreativeId !== null || sanitizeIdeaPromptsForConfirm().length === 0}
                    className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    确认生成
                  </button>
                </div>

                {showIdeaConfirmModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
                      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                        <h3 className="text-base font-medium text-gray-900">确认生成</h3>
                        <button
                          onClick={() => setShowIdeaConfirmModal(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Prompts</div>
                            <div className="font-medium">{sanitizeIdeaPromptsForConfirm().length} 条</div>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">模型</div>
                            <div className="font-medium">{ideaConfig.model}</div>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">风格</div>
                            <div className="font-medium">{resolveIdeaStyleKey() || 'cozy'}</div>
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-2">即将入队的 prompts（可返回继续编辑）</div>
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                              {sanitizeIdeaPromptsForConfirm().map((p, idx) => (
                                <div key={idx} className="p-3 text-sm text-gray-800 whitespace-pre-wrap break-words">
                                  <span className="text-xs text-gray-500 mr-2">#{idx + 1}</span>
                                  {p}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {ideaConfirmError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">{ideaConfirmError}</div>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            onClick={() => setShowIdeaConfirmModal(false)}
                            disabled={ideaConfirming}
                            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-60"
                          >
                            返回编辑
                          </button>
                          <button
                            onClick={handleIdeaConfirm}
                            disabled={ideaConfirming}
                            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {ideaConfirming ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            确认入队
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {generateMode === 'agent' && (
              <div className="relative h-full">
                <div className="absolute right-6 top-6 z-10 w-full max-w-xs rounded-2xl border border-gray-200 bg-white/95 shadow-lg p-4 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-800">生成偏好</div>
                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">自动</span>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-2">类型</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="px-3 py-1.5 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                        图片
                      </button>
                      <button className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-400 border border-gray-100" disabled>
                        视频
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 mb-2">选择比例</label>
                    <select
                      value={ideaConfig.aspectRatio}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, aspectRatio: e.target.value as IdeaConfig['aspectRatio'] })}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="3:4">3:4</option>
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 mb-2">图像模型</label>
                    <select
                      value={ideaConfig.model}
                      onChange={(e) => setIdeaConfig({ ...ideaConfig, model: e.target.value as IdeaConfig['model'] })}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="nanobanana">Nanobanana</option>
                      <option value="jimeng">即梦</option>
                    </select>
                  </div>
                </div>

                <div className="h-full">
                  <AgentCreator
                    theme={theme}
                    onClose={() => setGenerateMode('oneClick')}
                  />
                </div>
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
                        <span className={`px-2 py-0.5 rounded text-xs ${task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
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
                        placeholder="例如：干货/亲和"
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
      </div>

      {/* 底部素材库预览 */}
      <MaterialGallery
        packages={allPackages}
        onViewAll={() => setMainTab('library')}
        onSelect={(pkg) => setEditingPackage(pkg)}
      />
    </div>
  );
}

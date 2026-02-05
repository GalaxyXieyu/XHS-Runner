import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import type { Theme } from '@/App';
import { AgentCreator } from '@/features/agent/components/AgentCreator';
import { ContentResultCard } from '@/features/material-library/components/ContentResultCard';
import type { ContentPackage } from '@/features/material-library/types';
import { IdeaConfirmModal } from './generation/IdeaConfirmModal';
import { useGenerationStore } from '@/stores/useGenerationStore';

type IdeaConfig = {
  idea: string;
  styleKeyOption: 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom';
  customStyleKey: string;
  aspectRatio: '3:4' | '1:1' | '4:3';
  count: number;
  model: 'nanobanana' | 'jimeng' | 'jimeng-45';
  goal: 'collects' | 'comments' | 'followers';
  persona: string;
  tone: string;
  extraRequirements: string;
};

interface GenerationSectionProps {
  theme: Theme;
  generateMode: 'oneClick' | 'agent';
  setGenerateMode: (mode: 'oneClick' | 'agent') => void;
  ideaContentPackage: any;
  ideaPollingError: string;
  ideaStyleOptions: ReadonlyArray<{ key: IdeaConfig['styleKeyOption']; name: string }>;
  promptProfiles: ReadonlyArray<{ id: string; name: string }>;
  allPackages: ContentPackage[];
  setEditingPackage: (pkg: ContentPackage | null) => void;
  onNavigateToTaskCenter?: (taskIds?: number[]) => void;
}

export function GenerationSection({
  theme,
  generateMode,
  setGenerateMode,
  ideaContentPackage,
  ideaPollingError,
  ideaStyleOptions,
  promptProfiles,
  allPackages,
  setEditingPackage,
  onNavigateToTaskCenter,
}: GenerationSectionProps) {
  // Read state from stores
  const {
    ideaConfig,
    setIdeaConfig,
    ideaPreviewPrompts,
    handleIdeaPreview: storeHandleIdeaPreview,
    handleIdeaConfirm: storeHandleIdeaConfirm,
    updatePrompt,
    addPrompt,
    removePrompt,
    movePrompt,
    sanitizePromptsForConfirm,
    resolveStyleKey,
    ideaCreativeId,
    setIdeaCreativeId,
    ideaTaskIds,
    setIdeaTaskIds,
    showIdeaConfirmModal,
    setShowIdeaConfirmModal,
    ideaConfirming,
    ideaConfirmError,
    setIdeaConfirmError,
    ideaPreviewLoading,
    ideaPreviewError,
  } = useGenerationStore();

  // Component-specific local state (not in stores)

  // Wrapper functions to pass themeId to store actions
  const handleIdeaPreview = useCallback(() => {
    storeHandleIdeaPreview(Number(theme.id));
  }, [storeHandleIdeaPreview, theme.id]);

  const handleIdeaConfirm = useCallback(async () => {
    setIdeaTaskIds([]);
    await storeHandleIdeaConfirm();
    const latestTaskIds = useGenerationStore.getState().ideaTaskIds;
    if (latestTaskIds.length === 0) return;

    if (onNavigateToTaskCenter) {
      toast.success('任务已创建', {
        description: '前往任务中心查看进度',
        action: { label: '查看', onClick: () => onNavigateToTaskCenter(latestTaskIds) },
      });
    } else {
      toast.success('任务已创建', {
        description: '前往任务中心查看进度',
      });
    }
  }, [onNavigateToTaskCenter, setIdeaTaskIds, storeHandleIdeaConfirm]);

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

  const ideaProgress = useMemo(() => {
    const tasks = Array.isArray(ideaContentPackage?.tasks) ? ideaContentPackage.tasks : [];
    const total = tasks.length;
    const completed = tasks.filter((t: any) => t?.status === 'done').length;
    const finished = tasks.filter((t: any) => t?.status === 'done' || t?.status === 'failed').length;
    const percent = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { tasks, total, completed, percent };
  }, [ideaContentPackage]);

  return (
    <div className="flex flex-col h-full">
      {/* Agent 模式：全屏无边框 */}
      {generateMode === 'agent' ? (
        <div className="flex-1 overflow-hidden">
          <AgentCreator theme={theme} />
        </div>
      ) : (
      /* 其他模式：带边框和标题 */
      <div className="flex-1 bg-white border border-gray-200 rounded overflow-hidden">
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-medium text-gray-900">创建内容生成任务</h2>
              <div className="text-sm text-gray-500 mt-1">基于现有功能快速生成内容与素材</div>
            </div>

            {generateMode === 'oneClick' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">立即生成</div>
                      <div className="text-xs text-gray-500 mt-1">输入 idea，预览并确认多图 prompts</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">模式</span>
                      <div className="flex rounded-full border border-gray-200 bg-gray-50 p-1">
                        <button
                          onClick={() => setGenerateMode('oneClick')}
                          className="px-3 py-1 text-xs rounded-full transition bg-white text-gray-900 shadow-sm"
                        >
                          立即生成
                        </button>
                        <button
                          onClick={() => setGenerateMode('agent')}
                          className="px-3 py-1 text-xs rounded-full transition text-gray-500 hover:text-gray-700"
                        >
                          Agent 模式
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {ideaCreativeId !== null && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                      <div className="flex-1">
                        <div className="font-medium text-emerald-800">已提交生成任务</div>
                        <div className="text-xs mt-0.5 text-emerald-700">
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

                    {ideaPollingError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">进度轮询失败：{ideaPollingError}</div>
                      </div>
                    )}

                    {ideaContentPackage && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-gray-800">生成进度</div>
                          <div className="text-xs text-gray-500">
                            {ideaProgress.completed}/{ideaProgress.total} 已完成
                          </div>
                        </div>

                        <div className="w-full h-2 bg-gray-200/60 rounded-full overflow-hidden mb-3">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${ideaProgress.percent}%` }}
                          />
                        </div>

                        {ideaProgress.tasks.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {ideaProgress.tasks.slice(0, 6).map((t: any) => (
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

                    {ideaResultPackage ? (
                      <div>
                        <div className="text-sm font-medium text-gray-800 mb-2">生成结果</div>
                        <ContentResultCard pkg={ideaResultPackage} />
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-500">
                        生成完成后将展示结果，可在任务中心查看进度。
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">1</span>
                    <div className="text-sm font-semibold text-gray-900">填写 idea</div>
                    <div className="text-xs text-gray-500">用于生成多图 prompts</div>
                  </div>
                  <label htmlFor="idea-input" className="block text-sm font-medium text-gray-700 mb-2">
                    输入 idea <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="idea-input"
                    value={ideaConfig.idea}
                    onChange={(e) => setIdeaConfig({ idea: e.target.value })}
                    placeholder="例如：秋天的咖啡馆、通勤穿搭分享、周末露营清单..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                    <span>预览失败时也可手动编辑 prompts 继续</span>
                    <span>{ideaConfig.idea.length} 字</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">2</span>
                    <div className="text-sm font-semibold text-gray-900">补充参数</div>
                    <div className="text-xs text-gray-500">提升 prompts 质量</div>
                  </div>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="idea-goal" className="block text-sm text-gray-700 mb-2">内容目标</label>
                        <select
                          id="idea-goal"
                          value={ideaConfig.goal}
                          onChange={(e) => setIdeaConfig({ goal: e.target.value as IdeaConfig['goal'] })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="collects">收藏优先</option>
                          <option value="comments">评论优先</option>
                          <option value="followers">涨粉优先</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="idea-tone" className="block text-sm text-gray-700 mb-2">内容语气</label>
                        <input
                          id="idea-tone"
                          type="text"
                          value={ideaConfig.tone}
                          onChange={(e) => setIdeaConfig({ tone: e.target.value })}
                          placeholder="例如：干货/亲和、犀利吐槽、温柔治愈"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="idea-persona" className="block text-sm text-gray-700 mb-2">目标受众</label>
                      <input
                        id="idea-persona"
                        type="text"
                        value={ideaConfig.persona}
                        onChange={(e) => setIdeaConfig({ persona: e.target.value })}
                        placeholder="例如：学生党、职场女性、宝妈、露营新手"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="idea-extra" className="block text-sm text-gray-700 mb-2">额外要求（可选）</label>
                      <textarea
                        id="idea-extra"
                        value={ideaConfig.extraRequirements}
                        onChange={(e) => setIdeaConfig({ extraRequirements: e.target.value })}
                        placeholder="例如：不要出现品牌 logo；画面更极简；避免手部特写"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="idea-style" className="block text-sm text-gray-700 mb-2">风格</label>
                        <select
                          id="idea-style"
                          value={ideaConfig.styleKeyOption}
                          onChange={(e) => setIdeaConfig({ styleKeyOption: e.target.value as IdeaConfig['styleKeyOption'] })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {ideaStyleOptions.map((opt) => (
                            <option key={opt.key} value={opt.key}>{opt.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="idea-aspect" className="block text-sm text-gray-700 mb-2">比例</label>
                        <select
                          id="idea-aspect"
                          value={ideaConfig.aspectRatio}
                          onChange={(e) => setIdeaConfig({ aspectRatio: e.target.value as IdeaConfig['aspectRatio'] })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="3:4">3:4（小红书）</option>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="idea-count" className="block text-sm text-gray-700 mb-2">数量</label>
                        <input
                          id="idea-count"
                          type="number"
                          value={ideaConfig.count}
                          onChange={(e) => setIdeaConfig({ count: parseInt(e.target.value) || 1 })}
                          min={1}
                          max={9}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label htmlFor="idea-model" className="block text-sm text-gray-700 mb-2">图像模型</label>
                        <select
                          id="idea-model"
                          value={ideaConfig.model}
                          onChange={(e) => setIdeaConfig({ model: e.target.value as IdeaConfig['model'] })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="nanobanana">Nanobanana</option>
                          <option value="jimeng">即梦 4.0</option>
                          <option value="jimeng-45">即梦 4.5</option>
                        </select>
                      </div>
                    </div>

                    {ideaConfig.styleKeyOption === 'custom' && (
                      <div>
                        <label htmlFor="idea-custom-style" className="block text-sm text-gray-700 mb-2">自定义 styleKey</label>
                        <input
                          id="idea-custom-style"
                          type="text"
                          value={ideaConfig.customStyleKey}
                          onChange={(e) => setIdeaConfig({ customStyleKey: e.target.value })}
                          placeholder="例如：cozy（或任意自定义 key，若不存在将降级为默认）"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">3</span>
                      <div className="text-sm font-semibold text-gray-900">预览 prompts</div>
                      <span className="text-xs text-gray-500">({ideaPreviewPrompts.length})</span>
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

                  {ideaPreviewError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">预览失败</div>
                        <div className="text-xs mt-0.5">{ideaPreviewError}</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden bg-white">
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
                                onClick={() => movePrompt(idx, -1)}
                                disabled={idx === 0}
                                aria-label="上移 Prompt"
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                title="上移"
                              >
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              </button>
                              <button
                                onClick={() => movePrompt(idx, 1)}
                                disabled={idx === ideaPreviewPrompts.length - 1}
                                aria-label="下移 Prompt"
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                title="下移"
                              >
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              </button>
                              <button
                                onClick={() => removePrompt(idx)}
                                aria-label="删除 Prompt"
                                className="p-1 rounded hover:bg-red-50"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={prompt}
                              onChange={(e) => updatePrompt(idx, e.target.value)}
                              rows={3}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={addPrompt}
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
                      disabled={ideaCreativeId !== null || sanitizePromptsForConfirm().length === 0}
                      className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      确认生成
                    </button>
                  </div>
                </div>

                <IdeaConfirmModal
                  show={showIdeaConfirmModal}
                  prompts={sanitizePromptsForConfirm()}
                  ideaConfig={ideaConfig}
                  confirming={ideaConfirming}
                  error={ideaConfirmError}
                  resolveStyleKey={resolveStyleKey}
                  onClose={() => setShowIdeaConfirmModal(false)}
                  onConfirm={handleIdeaConfirm}
                />
              </div>
            )}

          </div>
        </div>
      </div>
      )}

    </div>
  );
}

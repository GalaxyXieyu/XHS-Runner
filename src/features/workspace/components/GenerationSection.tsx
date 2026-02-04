import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
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
import { ScheduledIdeasPanel, type ScheduledIdeaTask } from './generation/ScheduledIdeasPanel';
import { ScheduledJobCard } from './generation/ScheduledJobCard';
import { TaskFormModal } from './generation/TaskFormModal';
import { IdeaConfirmModal } from './generation/IdeaConfirmModal';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useBackgroundTaskStore } from '@/stores/useBackgroundTaskStore';

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
  lastNonAgentMode: 'oneClick' | 'scheduled';
  ideaContentPackage: any;
  ideaPollingError: string;
  ideaStyleOptions: ReadonlyArray<{ key: IdeaConfig['styleKeyOption']; name: string }>;
  promptProfiles: ReadonlyArray<{ id: string; name: string }>;
  allPackages: ContentPackage[];
  setMainTab: (tab: 'generate' | 'library' | 'tasks') => void;
  setEditingPackage: (pkg: ContentPackage | null) => void;
}

export function GenerationSection({
  theme,
  generateMode,
  setGenerateMode,
  lastNonAgentMode,
  ideaContentPackage,
  ideaPollingError,
  ideaStyleOptions,
  promptProfiles,
  allPackages,
  setMainTab,
  setEditingPackage,
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

  const {
    scheduledTasks,
    editingTask,
    showTaskForm,
    setEditingTask,
    setShowTaskForm,
    loadTasks,
  } = useTaskStore();

  const { submitTask, subscribeToTask, tasks: backgroundTasks } = useBackgroundTaskStore();

  // Component-specific local state (not in stores)
  const [scheduledIdeaTasks, setScheduledIdeaTasks] = useState<ScheduledIdeaTask[]>([]);
  const [scheduledIdeaLoading, setScheduledIdeaLoading] = useState(false);
  const [scheduledIdeaError, setScheduledIdeaError] = useState<string | null>(null);
  const [scheduledIdeaSelected, setScheduledIdeaSelected] = useState<string | null>(null);
  const [scheduledIdeaAutoRun, setScheduledIdeaAutoRun] = useState(false);
  const [agentBackLabel, setAgentBackLabel] = useState<string | null>(null);
  const [rerunningPrompt, setRerunningPrompt] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState<string>('');
  const [taskMutatingId, setTaskMutatingId] = useState<string | null>(null);
  const [jobExecutionsById, setJobExecutionsById] = useState<Record<string, any[]>>({});
  const [jobExecutionsOpenId, setJobExecutionsOpenId] = useState<string | null>(null);

  // Wrapper functions to pass themeId to store actions
  const handleIdeaPreview = useCallback(() => {
    storeHandleIdeaPreview(Number(theme.id));
  }, [storeHandleIdeaPreview, theme.id]);

  const handleIdeaConfirm = useCallback(async () => {
    await storeHandleIdeaConfirm();
  }, [storeHandleIdeaConfirm]);

  const loadJobs = useCallback(() => {
    loadTasks(Number(theme.id));
  }, [loadTasks, theme.id]);

  const loadScheduledIdeaTasks = useCallback(async () => {
    setScheduledIdeaLoading(true);
    setScheduledIdeaError(null);
    try {
      const res = await fetch(`/api/tasks?themeId=${theme.id}&limit=20&time_range=7d`);
      const data = await res.json().catch(() => []);
      const items: ScheduledIdeaTask[] = Array.isArray(data) ? data : [];
      // Daily-generate ideas are stored with model='agent' (prompt is the idea text).
      const filtered = items.filter((t: any) => t && t.model === 'agent');
      setScheduledIdeaTasks(filtered.slice(0, 5));
    } catch (err: any) {
      setScheduledIdeaError(err?.message || String(err));
      setScheduledIdeaTasks([]);
    } finally {
      setScheduledIdeaLoading(false);
    }
  }, [theme.id]);

  const loadJobExecutions = useCallback(async (jobId: string) => {
    try {
      const params = new URLSearchParams();
      params.set('jobId', String(jobId));
      params.set('limit', '5');
      const res = await fetch(`/api/jobs/executions?${params.toString()}`);
      const data = await res.json().catch(() => []);
      const items = Array.isArray(data) ? data : [];
      setJobExecutionsById((prev) => ({ ...prev, [jobId]: items }));
      return items;
    } catch (err) {
      console.error('Failed to load job executions:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    if (generateMode === 'scheduled') {
      loadScheduledIdeaTasks();
    }
  }, [generateMode, loadScheduledIdeaTasks]);

  useEffect(() => {
    if (!jobExecutionsOpenId) return;

    let timer: any;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const items = await loadJobExecutions(jobExecutionsOpenId);
      const latest = items?.[0];
      const status = String(latest?.status || '');
      // Only keep polling while an execution is in-progress.
      if (status === 'running' || status === 'pending') {
        timer = setTimeout(tick, 2500);
      }
    };

    timer = setTimeout(tick, 800);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobExecutionsOpenId, loadJobExecutions]);

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

  const handleCreateScheduleFromResult = () => {
    if (!ideaResultPackage) return;
    setEditingTask({
      id: 'new',
      name: `${ideaResultPackage.titles[0] || '内容生成'} 定时任务`,
      schedule: '每日 09:00',
      config: {
        goal: ideaConfig.goal,
        persona: ideaConfig.persona,
        tone: ideaConfig.tone,
        promptProfileId: promptProfiles[0]?.id || '1',
        imageModel: ideaConfig.model,
        outputCount: ideaConfig.count,
        minQualityScore: 70,
      },
      status: 'paused',
      nextRunAt: new Date().toISOString(),
      totalRuns: 0,
      successfulRuns: 0,
    });
    setShowTaskForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent 模式：全屏无边框 */}
      {generateMode === 'agent' ? (
        <div className="flex-1 overflow-hidden">
          <AgentCreator
            theme={theme}
            initialRequirement={scheduledIdeaSelected || undefined}
            autoRunInitialRequirement={scheduledIdeaAutoRun}
            backLabel={agentBackLabel || undefined}
            onClose={agentBackLabel ? () => {
              setScheduledIdeaAutoRun(false);
              setScheduledIdeaSelected(null);
              setAgentBackLabel(null);
              setGenerateMode(lastNonAgentMode);
            } : undefined}
          />
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

            {/* 生成方式选择 - 隐藏，默认使用agent */}
            <div className="mb-6 hidden">
              <label className="block text-sm font-medium text-gray-700 mb-3">生成方式</label>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
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
                        <ContentResultCard
                          pkg={ideaResultPackage}
                          onCreateSchedule={() => handleCreateScheduleFromResult()}
                        />
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-500 flex items-center justify-between">
                        <span>生成完成后可创建定时任务</span>
                        <button
                          className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-400 cursor-not-allowed"
                          disabled
                        >
                          定时发布
                        </button>
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
                          <option value="jimeng">即梦</option>
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

            {generateMode === 'scheduled' && (
              <div className="space-y-3">
                <ScheduledIdeasPanel
                  loading={scheduledIdeaLoading}
                  error={scheduledIdeaError}
                  items={scheduledIdeaTasks}
                  onRefresh={() => loadScheduledIdeaTasks()}
                  onOpenInAgent={(prompt) => {
                    setScheduledIdeaSelected(prompt);
                    setScheduledIdeaAutoRun(false);
                    setAgentBackLabel('返回定时生成');
                    setGenerateMode('agent');
                  }}
                  onRerun={async (prompt) => {
                    if (!prompt || rerunningPrompt) return;
                    setRerunningPrompt(prompt);
                    setRerunError(null);
                    try {
                      const taskId = await submitTask({
                        message: prompt,
                        themeId: Number(theme.id),
                        enableHITL: false,
                      });
                      subscribeToTask(taskId);
                      // 切换到任务页面查看进度
                      setMainTab('tasks');
                    } catch (err: any) {
                      setRerunError(err?.message || '提交任务失败');
                    } finally {
                      setRerunningPrompt(null);
                    }
                  }}
                  rerunningPrompt={rerunningPrompt}
                />

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
                    <ScheduledJobCard
                      key={task.id}
                      task={task}
                      mutating={taskMutatingId === task.id}
                      executions={jobExecutionsById[task.id] || []}
                      executionsOpen={jobExecutionsOpenId === task.id}
                      onEdit={() => {
                        setEditingTask(task);
                        setShowTaskForm(true);
                      }}
                      onTrigger={async () => {
                        setTaskSaveError('');
                        setTaskMutatingId(task.id);
                        try {
                          const res = await fetch(`/api/jobs/${task.id}/trigger`, { method: 'POST' });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data?.error || '触发执行失败');

                          await loadJobExecutions(task.id);
                          setJobExecutionsOpenId(task.id);
                        } catch (err: any) {
                          setTaskSaveError(err?.message || String(err));
                        } finally {
                          setTaskMutatingId(null);
                        }
                      }}
                      onToggleStatus={async () => {
                        setTaskSaveError('');
                        setTaskMutatingId(task.id);
                        try {
                          const res = await fetch(`/api/jobs/${task.id}/status`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: task.status === 'active' ? 'paused' : 'active' }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data?.error || '切换任务状态失败');

                          try {
                            await (window as any).scheduler?.start?.();
                          } catch (error) {
                            console.error('启动调度器失败:', error);
                          }

                          loadJobs();
                        } catch (err: any) {
                          setTaskSaveError(err?.message || String(err));
                        } finally {
                          setTaskMutatingId(null);
                        }
                      }}
                      onDelete={async () => {
                        if (!window.confirm(`确定删除任务「${task.name}」吗？`)) return;

                        setTaskSaveError('');
                        setTaskMutatingId(task.id);
                        try {
                          const res = await fetch(`/api/jobs/${task.id}`, { method: 'DELETE' });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data?.error || '删除任务失败');

                          loadJobs();
                        } catch (err: any) {
                          setTaskSaveError(err?.message || String(err));
                        } finally {
                          setTaskMutatingId(null);
                        }
                      }}
                      onToggleExecutions={async () => {
                        const next = jobExecutionsOpenId === task.id ? null : task.id;
                        setJobExecutionsOpenId(next);
                        if (next) await loadJobExecutions(task.id);
                      }}
                    />
                  ))
                )}
              </div>
            )}

            {/* 定时任务编辑弹窗 */}
            <TaskFormModal
              theme={theme}
              editingTask={editingTask}
              showTaskForm={showTaskForm}
              taskSaving={taskSaving}
              taskSaveError={taskSaveError}
              promptProfiles={promptProfiles}
              onClose={() => {
                setShowTaskForm(false);
                setEditingTask(null);
              }}
              onSave={async (payload) => {
                setTaskSaving(true);
                setTaskSaveError('');
                try {
                  if (editingTask && editingTask.id !== 'new') {
                    const res = await fetch(`/api/jobs/${editingTask.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data?.error || '更新定时任务失败');
                  } else {
                    const res = await fetch('/api/jobs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data?.error || '创建定时任务失败');
                  }

                  try {
                    if (payload.is_enabled) await (window as any).scheduler?.start?.();
                  } catch (error) {
                    console.error('启动调度器失败:', error);
                  }

                  setShowTaskForm(false);
                  setEditingTask(null);
                  loadJobs();
                } catch (err: any) {
                  setTaskSaveError(err?.message || String(err));
                  throw err;
                } finally {
                  setTaskSaving(false);
                }
              }}
            />
          </div>
        </div>
      </div>
      )}

    </div>
  );
}

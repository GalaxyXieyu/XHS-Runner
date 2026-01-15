import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Activity,
  Sparkles,
} from 'lucide-react';
import { ContentPackageEditor } from '@/features/material-library/components/ContentPackageEditor';
import type { ContentPackage } from '@/features/material-library/types';
import type { AutoTask, TaskExecution } from '@/features/task-management/types';
import type { CreativeTabProps } from '@/features/workspace/types';
import { GenerationSection } from '@/features/workspace/components/GenerationSection';
import { LibrarySection } from '@/features/workspace/components/LibrarySection';
import { TaskManagementSection } from '@/features/workspace/components/TaskManagementSection';

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
  const [generateMode, setGenerateMode] = useState<'oneClick' | 'scheduled' | 'agent'>('agent');
  const [taskStatusTab, setTaskStatusTab] = useState<'running' | 'completed' | 'failed'>('running');
  // UI 状态映射：
  // - 默认态：generateMode = oneClick 且 ideaCreativeId 为空
  // - Agent 模式态：generateMode = agent
  // - 运行态：ideaCreativeId 非空（进入生成/结果流）

  // 一键生成配置（= 立即生成，多图 + 可编辑 prompts）
  const [ideaConfig, setIdeaConfig] = useState({
    idea: '',
    styleKeyOption: 'cozy' as 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom',
    customStyleKey: '',
    aspectRatio: '3:4' as '3:4' | '1:1' | '4:3',
    count: 4,
    model: 'nanobanana' as 'nanobanana' | 'jimeng',
    goal: 'collects' as 'collects' | 'comments' | 'followers',
    persona: '25-35岁职场女性，追求实用与高效',
    tone: '干货/亲和',
    extraRequirements: '',
  });
  const [ideaPreviewPrompts, setIdeaPreviewPrompts] = useState<string[]>([]);
  const [ideaPreviewLoading, setIdeaPreviewLoading] = useState(false);
  const [ideaPreviewError, setIdeaPreviewError] = useState('');
  const [showIdeaConfirmModal, setShowIdeaConfirmModal] = useState(false);
  const [ideaConfirming, setIdeaConfirming] = useState(false);
  const [ideaConfirmError, setIdeaConfirmError] = useState('');
  const [ideaCreativeId, setIdeaCreativeId] = useState<number | null>(null);
  const [ideaTaskIds, setIdeaTaskIds] = useState<number[]>([]);
  const [ideaContentPackage, setIdeaContentPackage] = useState<any>(null);
  const [ideaPollingError, setIdeaPollingError] = useState('');

  // 选择状态
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // 弹窗状态
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<AutoTask | null>(null);
  const [editingPackage, setEditingPackage] = useState<ContentPackage | null>(null);

  // 数据状态
  const [allPackages, setAllPackages] = useState<ContentPackage[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<AutoTask[]>([]);
  const [taskExecutions, setTaskExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选状态
  const [libraryFilter, setLibraryFilter] = useState({
    source: 'all',
    searchQuery: '',
  });

  const promptProfiles = [
    { id: '1', name: '通用图文-收藏优先' },
    { id: '2', name: '种草文案模板' },
    { id: '3', name: '评论互动回复' },
  ] as const;

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

  // 数据流边界：
  // - /api/creatives: 内容包列表与运行态轮询数据源
  // - /api/jobs: 定时任务列表数据源
  // - /api/generate/preview: 仅生成 prompts 预览
  // - /api/generate/confirm: 进入生成队列并返回 creativeId/taskIds
  // 错误处理：统一走 try/catch，设置错误提示状态并记录 console

  useEffect(() => {
    if (ideaCreativeId === null) {
      setIdeaContentPackage(null);
      setIdeaPollingError('');
      return;
    }

    let cancelled = false;
    let timer: any;

    const poll = async () => {
      try {
        const res = await fetch(`/api/creatives/${ideaCreativeId}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setIdeaContentPackage(data);
          setIdeaPollingError('');
        }

        const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
        const isFinished = tasks.length > 0 && tasks.every((t: any) => t?.status === 'done' || t?.status === 'failed');
        if (isFinished) {
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '轮询失败';
        if (!cancelled) {
          setIdeaPollingError(message);
        }
      }

      timer = setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ideaCreativeId]);

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
          goal: ideaConfig.goal,
          persona: ideaConfig.persona,
          tone: ideaConfig.tone,
          extraRequirements: ideaConfig.extraRequirements,
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

  const sanitizeIdeaPromptsForConfirm = () => {
    return ideaPreviewPrompts
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .slice(0, 9);
  };

  const handleIdeaConfirm = async () => {
    if (ideaConfirming) return;

    const prompts = sanitizeIdeaPromptsForConfirm();
    if (prompts.length === 0) {
      setIdeaConfirmError('prompts 不能为空（可先预览或手动新增一条）');
      return;
    }

    setIdeaConfirmError('');
    setIdeaConfirming(true);

    try {
      const res = await fetch('/api/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts,
          model: ideaConfig.model,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const creativeId = Number(data?.creativeId);
      const taskIds = Array.isArray(data?.taskIds)
        ? data.taskIds.map((id: any) => Number(id)).filter((v: any) => Number.isFinite(v))
        : [];

      if (!Number.isFinite(creativeId) || taskIds.length === 0) {
        throw new Error('入队成功但返回值不完整（缺少 creativeId/taskIds）');
      }

      setIdeaCreativeId(creativeId);
      setIdeaTaskIds(taskIds);
      setShowIdeaConfirmModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认生成失败';
      console.error('Idea confirm failed:', message);
      setIdeaConfirmError(message);
    } finally {
      setIdeaConfirming(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex justify-end gap-1.5 px-4 py-3">
        {mainTab !== 'generate' && (
          <button
            onClick={() => setMainTab('generate')}
            className="px-3 py-1.5 text-xs rounded-full font-medium transition-all bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            <Sparkles className="w-3.5 h-3.5 inline mr-1" />
            返回创作
          </button>
        )}
        <button
          onClick={() => setMainTab('library')}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition-all ${mainTab === 'library'
            ? 'bg-gray-800 text-white'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Archive className="w-3.5 h-3.5 inline mr-1" />
          素材库
          <span className="ml-1 text-[10px] opacity-60">{allPackages.length}</span>
        </button>
        <button
          onClick={() => setMainTab('tasks')}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition-all ${mainTab === 'tasks'
            ? 'bg-gray-800 text-white'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5 inline mr-1" />
          任务管理
          {runningTasks.length > 0 && (
            <span className="ml-1 text-[10px] opacity-60">{runningTasks.length}</span>
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* ========== 内容生成 Tab ========== */}
        {mainTab === 'generate' && (
          <GenerationSection
            theme={theme}
            generateMode={generateMode}
            setGenerateMode={setGenerateMode}
            ideaCreativeId={ideaCreativeId}
            ideaTaskIds={ideaTaskIds}
            setIdeaCreativeId={setIdeaCreativeId}
            setIdeaTaskIds={setIdeaTaskIds}
            ideaPollingError={ideaPollingError}
            ideaContentPackage={ideaContentPackage}
            ideaConfig={ideaConfig}
            setIdeaConfig={setIdeaConfig}
            ideaStyleOptions={ideaStyleOptions}
            ideaPreviewPrompts={ideaPreviewPrompts}
            ideaPreviewLoading={ideaPreviewLoading}
            ideaPreviewError={ideaPreviewError}
            handleIdeaPreview={handleIdeaPreview}
            updateIdeaPrompt={updateIdeaPrompt}
            removeIdeaPrompt={removeIdeaPrompt}
            moveIdeaPrompt={moveIdeaPrompt}
            addIdeaPrompt={addIdeaPrompt}
            showIdeaConfirmModal={showIdeaConfirmModal}
            setShowIdeaConfirmModal={setShowIdeaConfirmModal}
            sanitizeIdeaPromptsForConfirm={sanitizeIdeaPromptsForConfirm}
            resolveIdeaStyleKey={resolveIdeaStyleKey}
            ideaConfirmError={ideaConfirmError}
            setIdeaConfirmError={setIdeaConfirmError}
            ideaConfirming={ideaConfirming}
            handleIdeaConfirm={handleIdeaConfirm}
            scheduledTasks={scheduledTasks}
            showTaskForm={showTaskForm}
            setShowTaskForm={setShowTaskForm}
            editingTask={editingTask}
            setEditingTask={setEditingTask}
            promptProfiles={promptProfiles}
            loadJobs={loadJobs}
            allPackages={allPackages}
            setMainTab={setMainTab}
            setEditingPackage={setEditingPackage}
          />
        )}

        {/* ========== 素材库 Tab ========== */}
        {mainTab === 'library' && (
          <LibrarySection
            loading={loading}
            filteredPackages={filteredPackages}
            libraryFilter={libraryFilter}
            setLibraryFilter={setLibraryFilter}
            scheduledTasks={scheduledTasks}
            selectedPackages={selectedPackages}
            setSelectedPackages={setSelectedPackages}
            allPackages={allPackages}
            setEditingPackage={setEditingPackage}
          />
        )}

        {/* ========== 任务管理 Tab ========== */}
        {mainTab === 'tasks' && (
          <TaskManagementSection
            taskStatusTab={taskStatusTab}
            setTaskStatusTab={setTaskStatusTab}
            runningTasks={runningTasks}
            completedTasks={completedTasks}
            failedTasks={failedTasks}
            selectedTasks={selectedTasks}
            setSelectedTasks={setSelectedTasks}
          />
        )}
      </div>

      {/* 编辑弹窗 */}
      {editingPackage && (
        <ContentPackageEditor
          pkg={editingPackage}
          onClose={() => setEditingPackage(null)}
          onSave={(updatedPkg) => {
            setAllPackages(prev => prev.map(p => p.id === updatedPkg.id ? updatedPkg : p));
          }}
        />
      )}
    </div>
  );
}

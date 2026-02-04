import { useEffect, useMemo, useState } from 'react';
import { ContentPackageEditor } from '@/features/material-library/components/ContentPackageEditor';
import type { ContentPackage } from '@/features/material-library/types';
import type { TaskExecution } from '@/features/task-management/types';
import type { CreativeTabProps } from '@/features/workspace/types';
import { GenerationSection } from '@/features/workspace/components/GenerationSection';
import { LibrarySection } from '@/features/workspace/components/LibrarySection';
import { TaskManagementSection } from '@/features/workspace/components/TaskManagementSection';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

export function CreativeTab({
  theme,
  mainTab: externalMainTab,
  onMainTabChange,
  generateMode: externalGenerateMode,
  onGenerateModeChange,
  onLibraryCountChange,
  onRunningTasksCountChange,
}: CreativeTabProps) {
  // 使用 Zustand stores
  const { ideaCreativeId } = useGenerationStore();

  const { scheduledTasks, loadTasks } = useTaskStore();

  const {
    allPackages,
    selectedPackages,
    editingPackage,
    libraryFilter,
    loading,
    setAllPackages,
    setSelectedPackages,
    setEditingPackage,
    setLibraryFilter,
    loadPackages,
    deletePackage,
    batchDelete,
    batchPublish,
  } = useLibraryStore();

  // 如果外部提供了 mainTab，使用外部状态；否则使用内部状态
  const [internalMainTab, setInternalMainTab] = useState<'generate' | 'library' | 'tasks'>('generate');
  const mainTab = externalMainTab ?? internalMainTab;
  const setMainTab = onMainTabChange ?? setInternalMainTab;

  const [internalGenerateMode, setInternalGenerateMode] = useState<'oneClick' | 'scheduled' | 'agent'>('agent');
  const generateMode = externalGenerateMode ?? internalGenerateMode;
  const setGenerateMode = onGenerateModeChange ?? setInternalGenerateMode;

  const [lastNonAgentMode, setLastNonAgentMode] = useState<'oneClick' | 'scheduled'>(() =>
    generateMode === 'scheduled' ? 'scheduled' : 'oneClick'
  );

  const setGenerateModeWithHistory = (mode: 'oneClick' | 'scheduled' | 'agent') => {
    if (mode !== 'agent') setLastNonAgentMode(mode);
    setGenerateMode(mode);
  };

  // 本地状态（不在 store 中）
  const [taskStatusTab, setTaskStatusTab] = useState<'running' | 'completed' | 'failed'>('running');
  const [taskExecutions, setTaskExecutions] = useState<TaskExecution[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [ideaContentPackage, setIdeaContentPackage] = useState<any>(null);
  const [ideaPollingError, setIdeaPollingError] = useState('');

  const promptProfiles = [
    { id: '1', name: '通用图文-收藏优先' },
    { id: '2', name: '种草文案模板' },
    { id: '3', name: '评论互动回复' },
  ] as const;

  // 加载数据
  useEffect(() => {
    loadPackages(Number(theme.id));
    loadTasks(Number(theme.id));
  }, [theme.id, loadPackages, loadTasks]);

  // 通知父组件素材库数量变化
  useEffect(() => {
    onLibraryCountChange?.(allPackages.length);
  }, [allPackages.length, onLibraryCountChange]);

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

  // 删除内容包（使用 store 方法）
  const handleDeletePackage = async (id: string) => {
    if (!confirm('确定要删除这个内容包吗？')) return;
    try {
      await deletePackage(id);
    } catch (error) {
      console.error('Failed to delete package:', error);
    }
  };

  // 批量删除（使用 store 方法）
  const handleBatchDelete = async (ids: string[]) => {
    if (!confirm(`确定要删除选中的 ${ids.length} 个内容包吗？`)) return;
    try {
      await batchDelete(ids);
    } catch (error) {
      console.error('Failed to batch delete:', error);
    }
  };

  // 批量发布（使用 store 方法）
  const handleBatchPublish = async (ids: string[]) => {
    const draftIds = ids.filter(id => allPackages.find(p => p.id === id)?.status === 'draft');
    if (draftIds.length === 0) return;
    if (!confirm(`确定要发布选中的 ${draftIds.length} 个草稿吗？`)) return;
    try {
      await batchPublish(draftIds);
    } catch (error) {
      console.error('Failed to batch publish:', error);
    }
  };

  // 任务执行筛选
  const runningTasks = taskExecutions.filter(e => e.status === 'running');
  const completedTasks = taskExecutions.filter(e => e.status === 'completed');
  const failedTasks = taskExecutions.filter(e => e.status === 'failed');

  // 通知父组件运行中任务数量变化
  useEffect(() => {
    onRunningTasksCountChange?.(runningTasks.length);
  }, [runningTasks.length, onRunningTasksCountChange]);

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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* ========== 内容生成 Tab ========== */}
        {mainTab === 'generate' && (
          <GenerationSection
            theme={theme}
            generateMode={generateMode}
            setGenerateMode={setGenerateModeWithHistory}
            lastNonAgentMode={lastNonAgentMode}
            ideaContentPackage={ideaContentPackage}
            ideaPollingError={ideaPollingError}
            ideaStyleOptions={ideaStyleOptions}
            promptProfiles={promptProfiles}
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
            onDeletePackage={handleDeletePackage}
            onBatchDelete={handleBatchDelete}
            onBatchPublish={handleBatchPublish}
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

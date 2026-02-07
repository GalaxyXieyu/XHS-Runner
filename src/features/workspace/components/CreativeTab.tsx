import { useEffect, useMemo } from 'react';
import { ContentPackageEditor } from '@/features/material-library/components/ContentPackageEditor';
import type { CreativeTabProps } from '@/features/workspace/types';
import { GenerationSection } from '@/features/workspace/components/GenerationSection';
import { LibrarySection } from '@/features/workspace/components/LibrarySection';
import { useLibraryStore } from '@/stores/useLibraryStore';

export function CreativeTab({
  theme,
  mainTab: externalMainTab,
  onLibraryCountChange,
}: CreativeTabProps) {
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

  const mainTab = externalMainTab ?? 'generate';

  // 加载数据 - 当 theme.id 变化时总是重新加载
  useEffect(() => {
    loadPackages(Number(theme.id));
  }, [theme.id, loadPackages]);

  // 通知父组件素材库数量变化
  useEffect(() => {
    onLibraryCountChange?.(allPackages.length);
  }, [allPackages.length, onLibraryCountChange]);


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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* ========== 内容生成 Tab ========== */}
        {mainTab === 'generate' && (
          <GenerationSection theme={theme} />
        )}

        {/* ========== 素材库 Tab ========== */}
        {mainTab === 'library' && (
          <LibrarySection
            loading={loading}
            filteredPackages={filteredPackages}
            libraryFilter={libraryFilter}
            setLibraryFilter={setLibraryFilter}
            selectedPackages={selectedPackages}
            setSelectedPackages={setSelectedPackages}
            allPackages={allPackages}
            setEditingPackage={setEditingPackage}
            onDeletePackage={handleDeletePackage}
            onBatchDelete={handleBatchDelete}
            onBatchPublish={handleBatchPublish}
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

import type { Dispatch, SetStateAction } from 'react';
import { Archive, Loader, Search, Trash2, CheckCircle2, X } from 'lucide-react';
import { CompactPackageCard } from '@/features/material-library/components/CompactPackageCard';
import type { ContentPackage } from '@/features/material-library/types';

type LibraryFilter = {
  source: string;
  searchQuery: string;
};

interface LibrarySectionProps {
  loading: boolean;
  filteredPackages: ContentPackage[];
  libraryFilter: LibraryFilter;
  setLibraryFilter: Dispatch<SetStateAction<LibraryFilter>>;
  selectedPackages: string[];
  setSelectedPackages: Dispatch<SetStateAction<string[]>>;
  allPackages: ContentPackage[];
  setEditingPackage: (pkg: ContentPackage | null) => void;
  onDeletePackage?: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchPublish?: (ids: string[]) => void;
}

export function LibrarySection({
  loading,
  filteredPackages,
  libraryFilter,
  setLibraryFilter,
  selectedPackages,
  setSelectedPackages,
  allPackages,
  setEditingPackage,
  onDeletePackage,
  onBatchDelete,
  onBatchPublish,
}: LibrarySectionProps) {
  // 防御性检查：确保 selectedPackages 是数组
  const safeSelectedPackages = Array.isArray(selectedPackages) ? selectedPackages : [];

  const selectedDraftCount = safeSelectedPackages.filter(id =>
    allPackages.find(p => p.id === id)?.status === 'draft'
  ).length;

  return (
    <div className="h-full flex flex-col p-4">
      {/* 批量操作栏 */}
      {safeSelectedPackages.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-red-700">已选择 {safeSelectedPackages.length} 项</span>
          <div className="flex gap-2 ml-auto">
            {selectedDraftCount > 0 && (
              <button
                onClick={() => onBatchPublish?.(safeSelectedPackages)}
                className="px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                批量发布 ({selectedDraftCount})
              </button>
            )}
            <button
              onClick={() => onBatchDelete?.(safeSelectedPackages)}
              className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              批量删除
            </button>
            <button
              onClick={() => setSelectedPackages([])}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              取消选择
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
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
          <div className="text-xs text-gray-500">在内容生成中创建或等待生成完成</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredPackages.map(pkg => (
              <CompactPackageCard
                key={pkg.id}
                pkg={pkg}
                isSelected={safeSelectedPackages.includes(pkg.id)}
                onToggleSelect={(id) => {
                  setSelectedPackages(prev =>
                    prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
                  );
                }}
                onTitleChange={() => { }}
                onEdit={(id) => {
                  const targetPackage = allPackages.find(p => p.id === id);
                  if (targetPackage) setEditingPackage(targetPackage);
                }}
                onDelete={onDeletePackage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

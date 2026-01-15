import type { Dispatch, SetStateAction } from 'react';
import { Archive, Loader, Search } from 'lucide-react';
import { CompactPackageCard } from '@/features/material-library/components/CompactPackageCard';
import type { ContentPackage } from '@/features/material-library/types';
import type { AutoTask } from '@/features/task-management/types';

type LibraryFilter = {
  source: string;
  searchQuery: string;
};

interface LibrarySectionProps {
  loading: boolean;
  filteredPackages: ContentPackage[];
  libraryFilter: LibraryFilter;
  setLibraryFilter: Dispatch<SetStateAction<LibraryFilter>>;
  scheduledTasks: AutoTask[];
  selectedPackages: string[];
  setSelectedPackages: Dispatch<SetStateAction<string[]>>;
  allPackages: ContentPackage[];
  setEditingPackage: (pkg: ContentPackage | null) => void;
}

export function LibrarySection({
  loading,
  filteredPackages,
  libraryFilter,
  setLibraryFilter,
  scheduledTasks,
  selectedPackages,
  setSelectedPackages,
  allPackages,
  setEditingPackage,
}: LibrarySectionProps) {
  return (
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
                onTitleChange={() => { }}
                onEdit={(id) => {
                  const targetPackage = allPackages.find(p => p.id === id);
                  if (targetPackage) setEditingPackage(targetPackage);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

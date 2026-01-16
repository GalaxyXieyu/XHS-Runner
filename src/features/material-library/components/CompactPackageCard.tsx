import {
  Image as ImageIcon,
  Check,
  Edit2,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import type { ContentPackage } from '../types';

interface CompactPackageCardProps {
  pkg: ContentPackage;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onTitleChange: (id: string, index: number) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;
}

export function CompactPackageCard({
  pkg,
  isSelected,
  onToggleSelect,
  onTitleChange,
  onEdit,
  onDelete,
  onPublish,
}: CompactPackageCardProps) {
  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-all hover:shadow-lg group ${
        isSelected ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200'
      }`}
    >
      {/* Cover Image - 3:4 aspect ratio */}
      <div className="relative aspect-[3/4] bg-gray-100">
        {pkg.coverImage ? (
          <img src={pkg.coverImage} alt="封面" className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Checkbox */}
        <button
          onClick={() => onToggleSelect(pkg.id)}
          className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            isSelected ? 'bg-red-500 border-red-500' : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* Delete Button - hover only */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(pkg.id); }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        {/* Status Badge */}
        <div className="absolute bottom-2 left-2">
          {pkg.status === 'published' ? (
            <div className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              已发布
            </div>
          ) : (
            <div className="px-2 py-0.5 bg-gray-800/80 text-white text-xs rounded-full">草稿</div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Title */}
        <div className="text-sm font-medium text-gray-900 line-clamp-2 mb-1.5 min-h-[2.5rem]">
          {pkg.titles[pkg.selectedTitleIndex]}
        </div>

        {/* Tags */}
        {pkg.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {pkg.tags.slice(0, 2).map((tag, idx) => (
              <span key={idx} className="text-xs text-gray-500">#{tag}</span>
            ))}
            {pkg.tags.length > 2 && (
              <span className="text-xs text-gray-400">+{pkg.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => onEdit?.(pkg.id)}
            className="flex-1 px-2 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
          >
            <Edit2 className="w-3 h-3" />
            编辑
          </button>
          {pkg.status === 'draft' && (
            <button
              onClick={() => onPublish?.(pkg.id)}
              className="flex-1 px-2 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              发布
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

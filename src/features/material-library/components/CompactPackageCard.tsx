import {
  FileText,
  Image as ImageIcon,
  Check,
  Clock,
  Heart,
  Bookmark,
  MessageSquare,
  Edit2,
  CheckCircle2,
} from 'lucide-react';
import type { ContentPackage } from '../types';

interface CompactPackageCardProps {
  pkg: ContentPackage;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onTitleChange: (id: string, index: number) => void;
  onEdit?: (id: string) => void;
}

export function CompactPackageCard({
  pkg,
  isSelected,
  onToggleSelect,
  onTitleChange,
  onEdit,
}: CompactPackageCardProps) {
  const getQualityColor = (score: number) => {
    if (score >= 85) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getQualityLabel = (score: number) => {
    if (score >= 85) return '优质';
    if (score >= 70) return '良好';
    return '一般';
  };

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden transition-all hover:shadow-md group ${
        isSelected ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200'
      }`}
    >
      {/* Cover Image */}
      <div className="relative h-36 bg-gray-100">
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
          className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-red-500 border-red-500' : 'bg-white/90 border-white hover:bg-white backdrop-blur-sm'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* Quality Score */}
        <div
          className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium border backdrop-blur-sm ${getQualityColor(
            pkg.qualityScore
          )}`}
        >
          {getQualityLabel(pkg.qualityScore)} {pkg.qualityScore}
        </div>

        {/* Status Badge */}
        <div className="absolute bottom-2 left-2">
          {pkg.status === 'published' ? (
            <div className="px-2 py-1 bg-green-500/90 text-white text-xs rounded flex items-center gap-1 backdrop-blur-sm">
              <CheckCircle2 className="w-3 h-3" />
              已发布
            </div>
          ) : (
            <div className="px-2 py-1 bg-gray-700/80 text-white text-xs rounded backdrop-blur-sm">草稿</div>
          )}
        </div>

        {/* Image Model Badge */}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded backdrop-blur-sm">
          {pkg.imageModel === 'nanobanana' ? 'Nano' : '即梦'}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Title with selector */}
        <div className="mb-2">
          <div className="flex items-center gap-1 mb-1">
            <FileText className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              标题 {pkg.selectedTitleIndex + 1}/{pkg.titles.length}
            </span>
          </div>
          <div className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
            {pkg.titles[pkg.selectedTitleIndex]}
          </div>
          {pkg.titles.length > 1 && (
            <div className="flex gap-1">
              {pkg.titles.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => onTitleChange(pkg.id, idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    idx === pkg.selectedTitleIndex
                      ? 'bg-red-500'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Preview */}
        <div className="text-xs text-gray-600 line-clamp-2 mb-2">{pkg.content}</div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {pkg.tags.slice(0, 3).map((tag, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
            >
              #{tag}
            </span>
          ))}
          {pkg.tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-gray-400 text-xs">+{pkg.tags.length - 3}</span>
          )}
        </div>

        {/* Metrics - Only for published */}
        {pkg.status === 'published' && pkg.actualMetrics && (
          <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-gray-50 rounded">
            <div className="text-center">
              <Heart className="w-3 h-3 text-gray-500 mx-auto mb-0.5" />
              <div className="text-xs font-medium text-gray-900">
                {pkg.actualMetrics.likes}
              </div>
              <div className="text-xs text-gray-400">点赞</div>
            </div>
            <div className="text-center">
              <Bookmark className="w-3 h-3 text-gray-500 mx-auto mb-0.5" />
              <div className="text-xs font-medium text-gray-900">
                {pkg.actualMetrics.collects}
              </div>
              <div className="text-xs text-gray-400">收藏</div>
            </div>
            <div className="text-center">
              <MessageSquare className="w-3 h-3 text-gray-500 mx-auto mb-0.5" />
              <div className="text-xs font-medium text-gray-900">
                {pkg.actualMetrics.comments}
              </div>
              <div className="text-xs text-gray-400">评论</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onEdit?.(pkg.id)}
            className="flex-1 px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
          >
            <Edit2 className="w-3 h-3" />
            编辑
          </button>
          {pkg.status === 'draft' && (
            <button className="flex-1 px-3 py-2 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              发布
            </button>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {pkg.createdAt}
        </div>
      </div>
    </div>
  );
}

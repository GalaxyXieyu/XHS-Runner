/**
 * MaterialGallery - 素材库展示组件
 *
 * 显示已生成的创作内容素材库
 */

import { Image, Loader2 } from "lucide-react";
import type { ContentPackage } from "@/features/material-library/types";

interface MaterialGalleryProps {
  packages: ContentPackage[];
  loading?: boolean;
  onSelect: (pkg: ContentPackage) => void;
}

export function MaterialGallery({ packages, loading, onSelect }: MaterialGalleryProps) {
  return (
    <div className="bg-gray-50/50 relative">
      <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Image className="w-4 h-4" />
            <span>灵感素材</span>
            {!loading && packages.length > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                {packages.length}
              </span>
            )}
          </div>
          <button className="text-xs text-blue-500 hover:text-blue-600 font-medium">
            查看更多 →
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {loading ? (
            <LoadingState />
          ) : packages.length > 0 ? (
            packages.slice(0, 12).map((pkg) => (
              <MaterialCard key={pkg.id} pkg={pkg} onClick={() => onSelect(pkg)} />
            ))
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

interface MaterialCardProps {
  pkg: ContentPackage;
  onClick: () => void;
}

function MaterialCard({ pkg, onClick }: MaterialCardProps) {
  const title = pkg.titles?.[pkg.selectedTitleIndex] || "未命名";
  
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="aspect-[3/4] rounded-2xl bg-gray-100 mb-2 overflow-hidden relative shadow-sm group-hover:shadow-lg group-hover:scale-[1.02] transition-all">
        {pkg.coverImage ? (
          <img
            src={pkg.coverImage}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
            <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
              <Image className="w-7 h-7 text-white/80" />
            </div>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-600 text-center font-medium line-clamp-1">
        {title}
      </p>
      {pkg.tags && pkg.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 justify-center">
          {pkg.tags.slice(0, 2).map((tag, idx) => (
            <span key={idx} className="text-xs text-gray-400">#{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="col-span-4 py-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
      <p className="text-sm text-gray-500">加载中...</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-4 py-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <Image className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-sm text-gray-500 mb-2">还没有创作内容</p>
      <p className="text-xs text-gray-400">在上方输入框描述你想创作的内容，AI 将为你生成</p>
    </div>
  );
}

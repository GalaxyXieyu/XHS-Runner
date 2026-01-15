"use client";

import type { ContentPackage } from "../types";
import { Edit3, Clock, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface ContentResultCardProps {
  pkg: ContentPackage;
  onEdit?: (id: string) => void;
  onCreateSchedule?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ContentResultCard({
  pkg,
  onEdit,
  onCreateSchedule,
  onDelete,
}: ContentResultCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = pkg.coverImage
    ? [pkg.coverImage]
    : [];

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const title = pkg.titles?.[pkg.selectedTitleIndex] || "未命名";
  const contentPreview =
    pkg.content?.length > 100 ? pkg.content.slice(0, 100) + "..." : pkg.content;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
      {/* 图片区域 */}
      <div className="relative aspect-[3/4] bg-gray-100">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrevImage}
                  aria-label="上一张"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={handleNextImage}
                  aria-label="下一张"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {images.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${
                        idx === currentImageIndex ? "bg-white" : "bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-sm">暂无图片</span>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        {/* 标题 */}
        <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{title}</h3>

        {/* 正文预览 */}
        <p className="text-sm text-gray-600 mb-3 line-clamp-3">
          {contentPreview || "暂无内容"}
        </p>

        {/* 标签 */}
        {pkg.tags && pkg.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {pkg.tags.slice(0, 5).map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs"
              >
                #{tag}
              </span>
            ))}
            {pkg.tags.length > 5 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                +{pkg.tags.length - 5}
              </span>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => onEdit?.(pkg.id)}
            className="flex-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            编辑
          </button>
        <button
            onClick={() => onCreateSchedule?.(pkg.id)}
            disabled={!onCreateSchedule}
            className={`flex-1 px-3 py-1.5 text-xs rounded-lg flex items-center justify-center gap-1 transition-colors ${
              onCreateSchedule ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-400 bg-gray-100 cursor-not-allowed'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            定时发布
          </button>
          <button
            onClick={() => onDelete?.(pkg.id)}
            aria-label="删除内容"
            className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

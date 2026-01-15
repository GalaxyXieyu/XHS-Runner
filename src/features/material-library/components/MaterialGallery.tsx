"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { ContentPackage } from "../types";

interface MaterialGalleryProps {
    packages: ContentPackage[];
    onViewAll?: () => void;
    onSelect?: (pkg: ContentPackage) => void;
}

export function MaterialGallery({
    packages,
    onViewAll,
    onSelect,
}: MaterialGalleryProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const displayPackages = packages.slice(0, 10);

    if (packages.length === 0) {
        return null;
    }

    return (
        <div className="border-t border-gray-200 bg-gray-50">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-2">
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                    <span>素材库</span>
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                        {packages.length}
                    </span>
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onViewAll?.()}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                    查看全部
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </button>
            </div>

            {/* 素材卡片列表 */}
            {isExpanded && (
                <div className="px-4 pb-3 overflow-x-auto">
                    <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                        {displayPackages.map((pkg) => (
                            <button
                                type="button"
                                key={pkg.id}
                                onClick={() => onSelect?.(pkg)}
                                className="w-32 flex-shrink-0 bg-white rounded-lg border border-gray-200 overflow-hidden text-left hover:shadow-md transition-shadow"
                            >
                                {/* 缩略图 */}
                                <div className="aspect-[3/4] bg-gray-100">
                                    {pkg.coverImage ? (
                                        <img
                                            src={pkg.coverImage}
                                            alt={pkg.titles?.[pkg.selectedTitleIndex] || "素材"}
                                            width={128}
                                            height={170}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                                            无图
                                        </div>
                                    )}
                                </div>
                                {/* 标题 */}
                                <div className="p-2">
                                    <div className="text-xs text-gray-700 line-clamp-2">
                                        {pkg.titles?.[pkg.selectedTitleIndex] || "未命名"}
                                    </div>
                                </div>
                            </button>
                        ))}

                        {/* 查看更多按钮 */}
                        {packages.length > 10 && (
                            <button
                                type="button"
                                onClick={onViewAll}
                                className="w-32 flex-shrink-0 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center hover:bg-gray-200 transition-colors"
                            >
                                <div className="text-center">
                                    <div className="text-sm text-gray-500">
                                        +{packages.length - 10}
                                    </div>
                                    <div className="text-xs text-gray-400">更多素材</div>
                                </div>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

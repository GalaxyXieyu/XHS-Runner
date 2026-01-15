"use client";

import { useState } from "react";
import { Settings, ChevronDown, ChevronUp } from "lucide-react";
import type { QuickGenConfig } from "../types";

interface QuickGenFormProps {
    visible: boolean;
    onClose: () => void;
    onGenerate: (config: QuickGenConfig) => void;
}

const ASPECT_RATIOS = [
    { value: "21:9", label: "21:9" },
    { value: "16:9", label: "16:9" },
    { value: "3:2", label: "3:2" },
    { value: "4:3", label: "4:3" },
    { value: "1:1", label: "1:1" },
    { value: "3:4", label: "3:4" },
    { value: "2:3", label: "2:3" },
    { value: "9:16", label: "9:16" },
];

export function QuickGenForm({ visible, onClose, onGenerate }: QuickGenFormProps) {
    const [config, setConfig] = useState<QuickGenConfig>({
        autoMode: true,
        mediaType: "image",
        aspectRatio: "3:4",
        count: 4,
        model: "nanobanana",
    });
    const [showAdvanced, setShowAdvanced] = useState(false);

    if (!visible) return null;

    return (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-gray-200 shadow-lg p-4 animate-in slide-in-from-bottom-2 duration-200">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">生成设置</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-xs text-gray-400 hover:text-gray-600"
                >
                    收起
                </button>
            </div>

            {/* 生成偏好 */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">生成偏好</span>
                <button
                    onClick={() => setConfig({ ...config, autoMode: !config.autoMode })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${config.autoMode ? "bg-blue-500" : "bg-gray-300"
                        }`}
                >
                    <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.autoMode ? "translate-x-7" : "translate-x-1"
                            }`}
                    />
                    <span
                        className={`absolute text-xs ${config.autoMode
                                ? "right-6 text-white"
                                : "left-5 text-gray-500"
                            }`}
                    >
                        {config.autoMode ? "自动" : "手动"}
                    </span>
                </button>
            </div>

            {/* 图片/视频切换 */}
            <div className="flex items-center gap-2 mb-4">
                <button
                    onClick={() => setConfig({ ...config, mediaType: "image" })}
                    className={`flex-1 py-2 text-sm rounded-lg transition-colors ${config.mediaType === "image"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                >
                    图片
                </button>
                <button
                    onClick={() => setConfig({ ...config, mediaType: "video" })}
                    className={`flex-1 py-2 text-sm rounded-lg transition-colors ${config.mediaType === "video"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                >
                    视频
                </button>
            </div>

            {/* 选择比例 */}
            <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">选择比例</div>
                <div className="grid grid-cols-8 gap-1.5">
                    {ASPECT_RATIOS.map((ratio) => (
                        <button
                            key={ratio.value}
                            onClick={() => setConfig({ ...config, aspectRatio: ratio.value })}
                            className={`py-1.5 text-xs rounded transition-colors ${config.aspectRatio === ratio.value
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                        >
                            {ratio.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 其他设置 */}
            <div
                className="flex items-center justify-between text-sm text-gray-500 cursor-pointer hover:text-gray-700 mb-3"
                onClick={() => setShowAdvanced(!showAdvanced)}
            >
                <span>其他设置</span>
                {showAdvanced ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
            </div>

            {showAdvanced && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">生成数量</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() =>
                                    setConfig({ ...config, count: Math.max(1, config.count - 1) })
                                }
                                className="w-7 h-7 bg-gray-100 rounded text-gray-600 hover:bg-gray-200"
                            >
                                -
                            </button>
                            <span className="w-8 text-center text-sm">{config.count}</span>
                            <button
                                onClick={() =>
                                    setConfig({ ...config, count: Math.min(9, config.count + 1) })
                                }
                                className="w-7 h-7 bg-gray-100 rounded text-gray-600 hover:bg-gray-200"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">图像模型</span>
                        <select
                            value={config.model}
                            onChange={(e) =>
                                setConfig({
                                    ...config,
                                    model: e.target.value as "nanobanana" | "jimeng",
                                })
                            }
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="nanobanana">Nanobanana</option>
                            <option value="jimeng">即梦</option>
                        </select>
                    </div>
                </div>
            )}

            {/* 确认按钮 */}
            <button
                onClick={() => onGenerate(config)}
                className="w-full mt-4 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
                确认生成
            </button>
        </div>
    );
}

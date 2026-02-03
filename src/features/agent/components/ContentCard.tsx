/**
 * ContentCard - 创作内容展示卡片
 * 
 * 显示 Writer Agent 生成的标题、正文、标签和图片
 */

import { X, RefreshCw, Download, Copy } from "lucide-react";
import type { ImageTask } from "../types";

export interface ParsedContent {
  title: string;
  body: string;
  tags: string[];
}

export interface ContentCardProps {
  content: ParsedContent;
  imageTasks?: ImageTask[];
  isStreaming?: boolean;
  onImageClick?: (imageUrl: string) => void;
  onRefresh?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
}

/**
 * 解析创作内容文本
 */
export function parseCreativeContent(content: string): ParsedContent | null {
  if (!content.includes("标题") || !content.includes("标签")) return null;

  const titleMatch = content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || "";

  const tagMatch = content.match(/标签[：:]\s*(.+?)(?:\n|$)/);
  const tagsStr = tagMatch?.[1] || "";
  const tags = tagsStr.match(/#[\w\u4e00-\u9fa5]+/g)?.map(t => t.slice(1)) || [];

  let body = content;
  const titleIndex = content.indexOf(titleMatch?.[0] || "");
  const tagIndex = content.indexOf(tagMatch?.[0] || "");

  if (titleMatch && tagMatch) {
    const startIdx = titleIndex + (titleMatch[0]?.length || 0);
    body = content.slice(startIdx, tagIndex).trim();
  }

  if (!title) return null;
  return { title, body, tags };
}

export function ContentCard({
  content,
  imageTasks = [],
  isStreaming = false,
  onImageClick,
  onRefresh,
  onCopy,
  onDownload,
}: ContentCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 标题区 */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold text-gray-900 leading-tight">
          {content.title}
        </h3>
      </div>

      {/* 正文区 */}
      <div className="px-4 py-2">
        <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {content.body}
        </div>
      </div>

      {/* 标签区 */}
      {content.tags.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {content.tags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 图片区 */}
      {imageTasks.length > 0 && (
        <div className="px-4 pb-4 pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">封面图</span>
            <span className="text-xs text-gray-400">
              {imageTasks.filter(t => t.status === "done").length}/{imageTasks.length}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imageTasks.map((task, i) => (
              <ImageTaskItem 
                key={task.id || i} 
                task={task} 
                onClick={onImageClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {!isStreaming && (
        <div className="px-4 pb-4 flex items-center gap-1.5">
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              重新生成
            </button>
          )}
          {onCopy && (
            <button 
              onClick={onCopy}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
            >
              <Copy className="w-3 h-3" />
              复制
            </button>
          )}
          {onDownload && (
            <button 
              onClick={onDownload}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
            >
              <Download className="w-3 h-3" />
              下载
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ImageTaskItemProps {
  task: ImageTask;
  onClick?: (imageUrl: string) => void;
}

function ImageTaskItem({ task, onClick }: ImageTaskItemProps) {
  const imageUrl = task.assetId ? `/api/assets/${task.assetId}` : undefined;
  
  return (
    <div className="flex-shrink-0 w-24">
      <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
        {task.status === "done" && imageUrl ? (
          <img
            src={imageUrl}
            alt="生成图片"
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onClick?.(imageUrl)}
          />
        ) : task.status === "failed" ? (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <X className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

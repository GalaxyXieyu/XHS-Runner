/**
 * ContentCard - 小红书帖子预览卡片
 *
 * 用于展示 Writer Agent 生成的标题、正文、标签和图片
 * 设计参考小红书 App 的帖子卡片风格
 */

import { useState, useCallback, type ReactNode } from "react";
import { X, Copy, Check, ImageIcon, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/utils";
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
  bodyRenderer?: ReactNode;
  onImageClick?: (imageUrl: string) => void;
}

// ---------------------------------------------------------------------------
// 标题清洗 - 去除转义引号、取第一个标题
// ---------------------------------------------------------------------------
function cleanTitle(raw: string): string {
  if (!raw) return "";
  // 去除首尾空白
  let title = raw.trim();
  // 去除转义引号 \"...\"
  title = title.replace(/\\"/g, '"');
  // 如果是多个标题用 "、" 分隔，取第一个
  const parts = title.split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    title = parts[0];
  }
  // 去除首尾引号
  title = title.replace(/^["'"「『]+/, "").replace(/["'"」』]+$/, "");
  return title;
}

// ---------------------------------------------------------------------------
// 解析创作内容文本
// ---------------------------------------------------------------------------
export function parseCreativeContent(content: string, fallback: boolean = false): ParsedContent | null {
  if (!content || content.trim() === "") return null;

  // 1. 尝试解析 JSON 格式
  try {
    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
      content.match(/(\{[\s\S]*"title"[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : "";
    if (jsonStr && jsonStr.startsWith("{")) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.title) {
        return {
          title: String(parsed.title),
          body: String(parsed.content || parsed.body || ""),
          tags: Array.isArray(parsed.tags)
            ? parsed.tags.map((t: string) => String(t).replace(/^#/, ""))
            : [],
        };
      }
    }
  } catch {
    // JSON 解析失败，继续尝试文本格式
  }

  // 2. 尝试解析标准格式（包含 "标题" 和 "标签"）
  if (content.includes("标题") && content.includes("标签")) {
    const titleMatch = content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
    const title = titleMatch?.[1]?.trim() || "";

    const tagMatch = content.match(/标签[：:]\s*(.+?)(?:\n|$)/);
    const tagsStr = tagMatch?.[1] || "";
    const tags = tagsStr.match(/#[\w\u4e00-\u9fa5]+/g)?.map((t) => t.slice(1)) || [];

    let body = content;
    const titleIndex = content.indexOf(titleMatch?.[0] || "");
    const tagIndex = content.indexOf(tagMatch?.[0] || "");

    if (titleMatch && tagMatch) {
      const startIdx = titleIndex + (titleMatch[0]?.length || 0);
      body = content.slice(startIdx, tagIndex).trim();
    }

    if (title) {
      return { title, body, tags };
    }
  }

  // 3. 尝试解析仅包含标题的格式
  if (content.includes("标题")) {
    const titleMatch = content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
    const title = titleMatch?.[1]?.trim() || "";
    if (title) {
      const titleIndex = content.indexOf(titleMatch?.[0] || "");
      const body = content.slice(titleIndex + (titleMatch[0]?.length || 0)).trim();
      const tags = body.match(/#[\w\u4e00-\u9fa5]+/g)?.map((t) => t.slice(1)) || [];
      return { title, body, tags };
    }
  }

  // 4. 回退模式 (仅限显式启用，且内容必须看起来像创作内容而非中间数据)
  if (fallback && content.trim().length > 30) {
    // 排除明显的非创作内容（JSON、Brief、系统消息等）
    const trimmed = content.trim();
    if (
      trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      trimmed.startsWith("Brief") ||
      trimmed.includes("workflow") ||
      trimmed.includes("agent_") ||
      trimmed.includes("layoutSpec")
    ) {
      return null;
    }

    const lines = trimmed.split("\n");
    const firstLine = lines[0]?.trim() || "";
    const restContent = lines.slice(1).join("\n").trim();
    const tags = content.match(/#[\w\u4e00-\u9fa5]+/g)?.map((t) => t.slice(1)) || [];

    return {
      title: firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine || "AI 生成内容",
      body: restContent || content,
      tags,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// ContentCard - 小红书风格帖子预览
// ---------------------------------------------------------------------------
export function ContentCard({
  content,
  imageTasks = [],
  isStreaming = false,
  bodyRenderer,
  onImageClick,
}: ContentCardProps) {
  const [copied, setCopied] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  const displayTitle = cleanTitle(content.title);
  const doneImages = imageTasks.filter((t) => t.status === "done");
  const hasImages = doneImages.length > 0;
  const pendingImages = imageTasks.filter((t) => t.status !== "done" && t.status !== "failed");

  const handleCopy = useCallback(() => {
    const text = [
      content.title,
      "",
      content.body,
      "",
      content.tags.map((t) => `#${t}`).join(" "),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  // Body 是否过长需要折叠
  const bodyText = content.body || "";
  const isBodyLong = bodyText.length > 300;
  const shouldTruncateBody = isBodyLong && !bodyExpanded;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-lg shadow-gray-100/60 overflow-hidden">
      {/* ====== 图片区域（置顶） ====== */}
      {imageTasks.length > 0 && (
        <div className="border-b border-gray-50">
          {hasImages ? (
            <div className={cn(
              "grid gap-0.5",
              doneImages.length === 1 && "grid-cols-1",
              doneImages.length === 2 && "grid-cols-2",
              doneImages.length === 3 && "grid-cols-3",
              doneImages.length >= 4 && "grid-cols-4",
            )}>
              {doneImages.map((task, i) => {
                const imageUrl = task.assetId ? `/api/assets/${task.assetId}` : undefined;
                return imageUrl ? (
                  <div
                    key={task.id || i}
                    className={cn(
                      "relative bg-gray-50 overflow-hidden cursor-pointer group",
                      doneImages.length === 1 ? "aspect-[16/9]" : "aspect-[3/4]",
                    )}
                    onClick={() => onImageClick?.(imageUrl)}
                  >
                    <img
                      src={imageUrl}
                      alt={`图片 ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {/* 序号角标 */}
                    <span className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                      {i + 1}/{imageTasks.length}
                    </span>
                  </div>
                ) : null;
              })}
              {/* 加载中的图片占位 */}
              {pendingImages.map((task, i) => (
                <div
                  key={`pending-${task.id || i}`}
                  className="aspect-[3/4] bg-gray-50 flex items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                    <span className="text-[10px] text-gray-400">生成中</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 全部加载中 */
            <div className="px-4 py-3 flex items-center gap-2 bg-gray-50/50">
              <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">
                正在生成 {imageTasks.length} 张配图...
              </span>
              <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* ====== 内容区域 ====== */}
      <div className="p-4 space-y-3">
        {/* 标题 */}
        <h3 className="text-[15px] font-bold text-gray-900 leading-snug">
          {displayTitle}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </h3>

        {/* 正文 */}
        <div className="relative">
          <div
            className={cn(
              "text-[13px] text-gray-600 leading-[1.8] whitespace-pre-wrap",
              shouldTruncateBody && "max-h-[120px] overflow-hidden",
            )}
          >
            {bodyRenderer || bodyText}
          </div>
          {/* 渐隐遮罩 + 展开按钮 */}
          {isBodyLong && !bodyExpanded && !bodyRenderer && (
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-10 bg-gradient-to-t from-white to-transparent" />
              <button
                type="button"
                onClick={() => setBodyExpanded(true)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors bg-white"
              >
                展开全文
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          )}
          {isBodyLong && bodyExpanded && !bodyRenderer && (
            <button
              type="button"
              onClick={() => setBodyExpanded(false)}
              className="mt-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              收起
            </button>
          )}
        </div>

        {/* 标签 */}
        {content.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {content.tags.map((tag, i) => (
              <span
                key={i}
                className="text-[13px] text-[#ff2442] font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ====== 底部操作栏 ====== */}
      {!isStreaming && (
        <div className="px-4 pb-3 pt-1 flex items-center gap-2 border-t border-gray-50">
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              copied
                ? "bg-green-50 text-green-600"
                : "bg-gray-50 text-gray-600 hover:bg-gray-50/80",
            )}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                复制文案
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageTaskItem (legacy, kept for backward compatibility)
// ---------------------------------------------------------------------------
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

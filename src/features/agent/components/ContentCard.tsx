/**
 * ContentCard - 小红书帖子预览卡片
 *
 * 用于展示 Writer Agent 生成的标题、正文、标签和图片
 * 设计参考小红书 App 的帖子卡片风格
 */

import { useState, useCallback, type ReactNode } from "react";
import { X, Copy, Check, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
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
// ImageCarousel - 图片轮播（自适应高度，填满卡片左侧）
// ---------------------------------------------------------------------------
interface ImageCarouselProps {
  doneImages: ImageTask[];
  onImageClick?: (imageUrl: string) => void;
}

function ImageCarousel({ doneImages, onImageClick }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = doneImages.length;
  const currentTask = doneImages[activeIndex];
  const imageUrl = currentTask?.assetId ? `/api/assets/${currentTask.assetId}` : undefined;

  const goPrev = () => setActiveIndex((i) => (i <= 0 ? total - 1 : i - 1));
  const goNext = () => setActiveIndex((i) => (i >= total - 1 ? 0 : i + 1));

  return (
    <div className="relative w-1/2 flex-shrink-0 bg-neutral-900 group/carousel self-stretch flex items-center justify-center overflow-hidden">
      {/* 图片 - 完整展示，居中适配 */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`图片 ${activeIndex + 1}`}
          className="w-full h-full object-contain cursor-pointer"
          onClick={() => onImageClick?.(imageUrl)}
        />
      )}

      {/* 序号角标 */}
      {total > 1 && (
        <span className="absolute top-2.5 right-2.5 bg-black/40 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm font-medium tabular-nums">
          {activeIndex + 1}/{total}
        </span>
      )}

      {/* 左右箭头 - hover 显示，小巧精致 */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-700" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-700" />
          </button>
        </>
      )}

      {/* 底部圆点指示器 */}
      {total > 1 && (
        <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "rounded-full transition-all",
                i === activeIndex
                  ? "w-4 h-1.5 bg-white"
                  : "w-1.5 h-1.5 bg-white/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentCard - 小红书风格帖子预览（左图右文布局）
// ---------------------------------------------------------------------------
export function ContentCard({
  content,
  imageTasks = [],
  isStreaming = false,
  bodyRenderer,
  onImageClick,
}: ContentCardProps) {
  const [copied, setCopied] = useState(false);

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

  const bodyText = content.body || "";

  const useLeftRightLayout = imageTasks.length > 0 && hasImages;

  // ── 标题 ──
  const titleBlock = (
    <h3 className="text-[15px] font-bold text-gray-900 leading-snug tracking-[-0.01em] flex-shrink-0">
      {displayTitle}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
      )}
    </h3>
  );

  // ── 正文（自适应高度，内部滚动） ──
  const bodyBlock = (
    <div className="text-[13px] text-gray-500 leading-[1.75] whitespace-pre-wrap overflow-y-auto min-h-0 flex-1 mt-3 scrollbar-thin">
      {bodyRenderer || bodyText}
    </div>
  );

  // ── 标签区 ──
  const tagsBlock = content.tags.length > 0 && (
    <div className="flex flex-wrap gap-x-2 gap-y-1.5 pt-3 border-t border-gray-100">
      {content.tags.map((tag, i) => (
        <span key={i} className="text-[12px] text-[#ff2442] font-medium">
          #{tag}
        </span>
      ))}
    </div>
  );

  // ── 操作栏 ──
  const actionBar = !isStreaming && (
    <div className="pt-3 border-t border-gray-100">
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all",
          copied ? "bg-emerald-50 text-emerald-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50",
        )}
      >
        {copied ? (
          <><Check className="w-3 h-3" /> 已复制</>
        ) : (
          <><Copy className="w-3 h-3" /> 复制文案</>
        )}
      </button>
    </div>
  );

  return (
    <div
      className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.06)" }}
    >
      {useLeftRightLayout ? (
        /* ── 左右布局：左图轮播 + 右文字 ── */
        <div className="flex flex-row h-[360px]">
          <ImageCarousel doneImages={doneImages} onImageClick={onImageClick} />
          <div className="flex-1 p-5 flex flex-col min-w-0 min-h-0">
            {titleBlock}
            {bodyBlock}
            {tagsBlock}
            {actionBar}
          </div>
        </div>
      ) : imageTasks.length > 0 && !hasImages ? (
        /* ── 图片加载中：左侧占位 + 右侧文字 ── */
        <div className="flex flex-row h-[360px]">
          <div className="w-1/2 flex-shrink-0 bg-gray-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="w-5 h-5 text-gray-300" />
              <span className="text-[11px] text-gray-400">生成 {imageTasks.length} 张配图...</span>
              <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
            </div>
          </div>
          <div className="flex-1 p-5 flex flex-col min-w-0 min-h-0">
            {titleBlock}
            {bodyBlock}
            {tagsBlock}
            {actionBar}
          </div>
        </div>
      ) : (
        /* ── 无图片：全宽布局 ── */
        <div className="p-5 space-y-3">
          {titleBlock}
          <div className="text-[13px] text-gray-500 leading-[1.75] whitespace-pre-wrap">
            {bodyRenderer || bodyText}
          </div>
          {tagsBlock}
          {actionBar}
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

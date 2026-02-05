/**
 * ContextPreviewCard - HITL 上下文预览卡片
 *
 * 格式化显示 Agent 对话中的上下文数据，过滤掉技术字段（如 image_templates）
 * 只显示用户关心的内容：标题、正文、标签
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

// 技术字段列表，这些字段不会显示在预览中
const TECHNICAL_FIELDS = new Set([
  'id',
  'creativeId',
  'status',
  'model',
  'prompt',
  'image_templates',
  'rationale',
  'coverStyle',
  'coverPrompt',
  'script',
  'sourceTopicId',
  'sourceTopicIds',
  'resultAssetId',
  'createdAt',
  'updatedAt',
  '__hitl',
  'kind',
  'data',
]);

interface DisplayData {
  title: string;
  body: string;
  tags: string[];
}

interface ContextPreviewCardProps {
  context: Record<string, unknown>;
}

/**
 * 解析标签数据
 * 支持多种格式：字符串数组、逗号分隔字符串、带 # 号的字符串
 */
function parseTags(tags: unknown): string[] {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    return tags
      .filter(Boolean)
      .map(tag => String(tag).trim().replace(/^#/, ''))
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    return tags
      .split(/[,，#]/)
      .map(t => t.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * 从 context 对象中提取显示数据
 * 支持 HITL 格式和原始 creative 格式
 */
function extractDisplayData(context: Record<string, unknown>): DisplayData | null {
  if (!context || Object.keys(context).length === 0) {
    return null;
  }

  // HITL 格式: { __hitl: true, kind: "content" | "image_plans", data: {...} }
  if (context.__hitl === true && context.data) {
    const data = context.data as Record<string, unknown>;

    // 图片规划类型
    if (context.kind === "image_plans" && Array.isArray(data.plans)) {
      return {
        title: "图片规划",
        body: `已生成 ${data.plans.length} 个图片计划`,
        tags: [],
      };
    }

    // 内容确认类型
    if (context.kind === "content") {
      return {
        title: String(data.title || "未命名"),
        body: String(data.body || ""),
        tags: parseTags(data.tags),
      };
    }

    // 通用 HITL data
    if (data.title || data.body) {
      return {
        title: String(data.title || "未命名"),
        body: String(data.body || ""),
        tags: parseTags(data.tags),
      };
    }
  }

  // 原始 creative 格式: { title, content, tags, ... }
  if (context.title || context.content) {
    return {
      title: String(context.title || "未命名"),
      body: String(context.content || ""),
      tags: parseTags(context.tags),
    };
  }

  // 尝试从剩余字段中提取有用信息
  const remainingKeys = Object.keys(context).filter(key => !TECHNICAL_FIELDS.has(key));
  if (remainingKeys.length > 0) {
    // 检查是否有看起来像内容的字段
    const contentField = remainingKeys.find(key =>
      /content|body|description|text/i.test(key)
    );

    const titleField = remainingKeys.find(key =>
      /title|name|subject/i.test(key)
    );

    const tagsField = remainingKeys.find(key =>
      /tags?|labels?|keywords?/i.test(key)
    );

    if (contentField || titleField) {
      return {
        title: titleField ? String(context[titleField]) || "未命名" : "未命名",
        body: contentField ? String(context[contentField]) || "" : "",
        tags: tagsField ? parseTags(context[tagsField]) : [],
      };
    }
  }

  return null;
}

const MAX_PREVIEW_LENGTH = 200;

/**
 * 上下文预览卡片组件
 */
export function ContextPreviewCard({ context }: ContextPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const data = extractDisplayData(context);

  // 无法提取有效数据
  if (!data) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-2">
        暂无可预览内容
      </div>
    );
  }

  const { title, body, tags } = data;
  const shouldTruncate = body.length > MAX_PREVIEW_LENGTH;
  const displayBody = shouldTruncate && !isExpanded
    ? body.slice(0, MAX_PREVIEW_LENGTH) + "..."
    : body;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      {/* 标题 */}
      {title && (
        <h4 className="font-semibold text-sm text-gray-900 leading-snug">
          {title}
        </h4>
      )}

      {/* 正文 */}
      {body && (
        <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
          {displayBody}
          {shouldTruncate && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-700 ml-1 font-medium"
            >
              {isExpanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      )}

      {/* 标签 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

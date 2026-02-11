/**
 * HITL 交互消息组件
 * 在对话流中展示 human-in-the-loop 交互历史
 */

import { useState } from "react";
import { Check, MessageSquare, Edit3, ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { ChatMessage, AskUserOption, AskUserDialogState } from "../types";

interface HITLMessageProps {
  message: ChatMessage;
  /** 是否已有用户响应（下一条消息是否是用户响应） */
  hasResponse?: boolean;
}

interface InteractiveHITLProps {
  state: AskUserDialogState;
  onStateChange: (state: AskUserDialogState) => void;
  onSubmit: () => void;
}

// ─── 内容提取与预览 ─────────────────────────────

interface HITLContentData {
  kind: "content" | "image_plans" | "unknown";
  title: string;
  body: string;
  tags: string[];
}

const MAX_PREVIEW_LENGTH = 200;

/** 从 HITL context 中提取内容数据 */
export function extractHITLContent(context: unknown): HITLContentData | null {
  if (!context || typeof context !== "object") return null;
  const ctx = context as Record<string, any>;
  if (!ctx.__hitl || !ctx.data) return null;

  const data = ctx.data as Record<string, any>;

  if (ctx.kind === "content" && (data.title || data.body)) {
    const tags: string[] = Array.isArray(data.tags)
      ? data.tags.map((t: any) => String(t).replace(/^#/, "")).filter(Boolean)
      : typeof data.tags === "string"
        ? data.tags.split(/[,，#]/).map((t: string) => t.trim()).filter(Boolean)
        : [];
    return {
      kind: "content",
      title: String(data.title || "未命名"),
      body: String(data.body || ""),
      tags,
    };
  }

  if (ctx.kind === "image_plans" && Array.isArray(data.plans)) {
    return {
      kind: "image_plans",
      title: "图片规划",
      body: data.plans.map((p: any, i: number) => `${i + 1}. ${p.description || p.prompt || ""}`.trim()).join("\n"),
      tags: [],
    };
  }

  return null;
}

/** 内联内容预览组件 */
function ContentPreview({
  data,
  isExpanded,
  onToggle,
}: {
  data: HITLContentData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const shouldTruncate = data.body.length > MAX_PREVIEW_LENGTH;
  const displayBody = shouldTruncate && !isExpanded
    ? data.body.slice(0, MAX_PREVIEW_LENGTH) + "..."
    : data.body;

  return (
    <div className="mx-3.5 mb-2 rounded-2xl bg-gradient-to-b from-gray-50/80 to-gray-100/50 border border-black/[0.04] overflow-hidden">
      {/* 标题 */}
      <div className="px-4 pt-3.5 pb-1.5">
        <h4 className="text-[13px] font-semibold text-gray-900 leading-snug tracking-[-0.01em]">{data.title}</h4>
      </div>

      {/* 正文 */}
      {data.body && (
        <div className="px-4 pb-2.5">
          <p className="text-xs text-gray-500 whitespace-pre-wrap leading-[1.65]">
            {displayBody}
          </p>
          {shouldTruncate && (
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-0.5 mt-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              {isExpanded ? (
                <>收起 <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>展开全文 <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* 标签 */}
      {data.tags.length > 0 && (
        <div className="px-4 pb-3.5 flex flex-wrap gap-1.5">
          {data.tags.map((tag, i) => (
            <span
              key={i}
              className="inline-block px-2.5 py-[3px] rounded-full bg-violet-500/[0.08] text-violet-600 text-[11px] font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 可交互的 HITL 气泡组件（当前正在等待用户响应）
 * 简化版：更紧凑的样式
 */
export function InteractiveHITLBubble({ state, onStateChange, onSubmit }: InteractiveHITLProps) {
  const [customInput, setCustomInput] = useState(state.customInput || "");
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const isContentConfirm = !!(state.context as any)?.__hitl;

  // 从 context 中提取内容数据（文案/图片规划）
  const contentData = extractHITLContent(state.context);

  const handleOptionSelect = (optionId: string) => {
    if (state.selectionType === "single") {
      onStateChange({ ...state, selectedIds: [optionId] });

      // 如果选择了"继续"（approve），延迟提交让用户看到选中效果
      if (optionId === "approve") {
        setTimeout(() => onSubmit(), 300);
      }
      // 如果选择了"重生成"（reject），显示反馈输入框
      else if (optionId === "reject") {
        setShowFeedbackInput(true);
      }
    } else {
      const newIds = state.selectedIds.includes(optionId)
        ? state.selectedIds.filter(id => id !== optionId)
        : [...state.selectedIds, optionId];
      onStateChange({ ...state, selectedIds: newIds });
    }
  };

  const handleCustomInputChange = (value: string) => {
    setCustomInput(value);
    onStateChange({ ...state, customInput: value });
  };

  const handleSubmit = () => {
    // 如果选择了"重生成"但没有输入反馈，提示用户
    const selectedId = state.selectedIds[0];
    if (selectedId === "reject" && !customInput.trim()) {
      window.alert("要重生成的话，写一句建议会更好哦");
      return;
    }
    onSubmit();
  };

  const isSubmitDisabled = state.options.length > 0 && state.selectedIds.length === 0;
  const selectedId = state.selectedIds[0];
  const needsFeedback = selectedId === "reject" && showFeedbackInput;

  // 有内容预览时加宽显示区域
  const bubbleMaxWidth = contentData ? "max-w-[85%]" : "max-w-[70%]";

  return (
    <div className={`bg-white/95 backdrop-blur-xl border border-black/[0.06] rounded-2xl ${bubbleMaxWidth}`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 14px rgba(0,0,0,0.06), 0 16px 40px -8px rgba(0,0,0,0.08)' }}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200/60 flex items-center justify-center flex-shrink-0">
          {contentData ? <FileText className="w-2.5 h-2.5 text-amber-500" /> : <MessageSquare className="w-2.5 h-2.5 text-amber-500" />}
        </div>
        <span className="text-[13px] font-semibold text-gray-800 tracking-[-0.01em]">
          {isContentConfirm ? "内容确认" : "需要选择"}
        </span>
      </div>

      {/* 内容预览区域（从 context 中提取的文案/图片规划） */}
      {contentData && (
        <ContentPreview
          data={contentData}
          isExpanded={isContentExpanded}
          onToggle={() => setIsContentExpanded(!isContentExpanded)}
        />
      )}

      {/* 操作区域 */}
      <div className="px-4 pb-4 pt-2">
        {/* 问题提示 */}
        {!contentData && (
          <p className="text-[13px] text-gray-500 mb-3.5 leading-relaxed">{state.question}</p>
        )}

      {/* 可点击的选项列表 */}
      {state.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.options.map((option) => {
            const isSelected = state.selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                onClick={() => handleOptionSelect(option.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-[13px] font-medium transition-all duration-200 ${
                  isSelected
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-white border-black/[0.08] text-gray-700 hover:border-black/[0.15] hover:bg-gray-50/80 active:scale-[0.98]"
                }`}
                style={isSelected ? { boxShadow: '0 2px 8px rgba(16,185,129,0.3)' } : { boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
              >
                {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 反馈输入框（仅在选择"重生成"时显示） */}
      {needsFeedback && (
        <div className="mt-3 space-y-2.5">
          <textarea
            value={customInput}
            onChange={(e) => handleCustomInputChange(e.target.value)}
            placeholder="请告诉我需要改进的地方..."
            className="w-full px-3.5 py-2.5 text-[13px] border border-black/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none bg-gray-50/50 transition-all placeholder:text-gray-400"
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowFeedbackInput(false);
                setCustomInput("");
                onStateChange({ ...state, selectedIds: [], customInput: "" });
              }}
              className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!customInput.trim()}
              className="px-4 py-1.5 bg-emerald-500 text-white text-[12px] font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all active:scale-[0.97]"
              style={{ boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}
            >
              <Check className="w-3 h-3" strokeWidth={2.5} />
              提交
            </button>
          </div>
        </div>
      )}

      {/* 普通选项的确认按钮（非 approve/reject 时显示） */}
      {selectedId && selectedId !== "approve" && selectedId !== "reject" && !needsFeedback && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-emerald-500 text-white text-[13px] font-medium rounded-xl hover:bg-emerald-600 flex items-center gap-1.5 transition-all active:scale-[0.97]"
            style={{ boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            确认
          </button>
        </div>
      )}
      </div>{/* end 操作区域 */}
    </div>
  );
}

/**
 * 可点击的选项项组件
 */
function InteractiveOptionItem({
  option,
  isSelected,
  onClick
}: {
  option: AskUserOption;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
        isSelected
          ? "bg-gradient-to-r from-gray-800 to-gray-900 border-gray-700 shadow-lg shadow-gray-900/20"
          : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
          isSelected
            ? "border-white bg-white"
            : "border-gray-300"
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-gray-900" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium transition-colors ${
          isSelected ? "text-white" : "text-gray-800"
        }`}>
          {option.label}
        </p>
        {option.description && (
          <p className={`text-xs mt-0.5 transition-colors ${
            isSelected ? "text-gray-300" : "text-gray-500"
          }`}>
            {option.description}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * 渲染 HITL 请求消息（Agent 提问）- 历史记录中的静态展示
 */
export function HITLRequestMessage({ message }: HITLMessageProps) {
  const { askUser } = message;
  if (!askUser) return null;

  const isContentConfirm = askUser.isHITL;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/60 rounded-2xl p-5 max-w-[85%] shadow-sm">
      {/* 标题 */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-sm">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-amber-800">
          {isContentConfirm ? "内容确认" : "需要您的选择"}
        </span>
      </div>

      {/* 问题 */}
      <p className="text-sm text-gray-700 mb-4 leading-relaxed">{askUser.question}</p>

      {/* 选项列表 */}
      {askUser.options.length > 0 && (
        <div className="space-y-2">
          {askUser.options.map((option) => (
            <OptionItem key={option.id} option={option} isSelected={false} />
          ))}
        </div>
      )}

      {/* 提示可以输入自定义内容 */}
      {askUser.allowCustomInput && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
          <Edit3 className="w-3.5 h-3.5" />
          <span>支持输入自定义反馈</span>
        </div>
      )}
    </div>
  );
}

/**
 * 渲染用户响应消息
 */
export function HITLResponseMessage({ message }: { message: ChatMessage }) {
  const { askUserResponse } = message;
  const [isContentCollapsed, setIsContentCollapsed] = useState(true);
  
  if (!askUserResponse) {
    // 普通用户消息
    return (
      <div
        className="bg-gray-900 text-white rounded-2xl px-5 py-3 max-w-[70%]"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
      >
        <p className="text-[13px] leading-relaxed">{message.content}</p>
      </div>
    );
  }

  const { selectedLabels, customInput } = askUserResponse;
  const hasSelection = selectedLabels.length > 0;
  const hasCustomInput = customInput && customInput.trim();

  // 检查是否携带 HITL 内容（文案/图片规划）
  // 注意：有内容的确认由 MessageTypeRenderer 拆分渲染（左内容+右确认），
  // 这里只处理被 MessageTypeRenderer fallback 调用的情况
  const contentData = extractHITLContent(askUserResponse.context);
  const hasContent = !!contentData;

  if (hasContent) {
    return (
      <div className="max-w-[85%] space-y-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setIsContentCollapsed(!isContentCollapsed)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-gray-400 hover:text-gray-600 hover:bg-black/[0.03] transition-colors"
          >
            {isContentCollapsed ? (
              <>查看内容 <ChevronDown className="w-3 h-3" /></>
            ) : (
              <>收起 <ChevronUp className="w-3 h-3" /></>
            )}
          </button>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
            bg-emerald-50 border border-emerald-200/60 text-emerald-700
            text-xs font-medium select-none">
            <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
            <span>{selectedLabels.join("、") || "已确认"}</span>
          </div>
        </div>

        {!isContentCollapsed && (
          <CollapsedContentCard data={contentData} />
        )}

        {hasCustomInput && (
          <div className="flex justify-end">
            <span className="inline-block px-4 py-2 rounded-xl bg-gray-900 text-white text-[12px]"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
            >
              {customInput}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 简单确认（无内容、无自定义输入）→ 精致胶囊
  const isSimpleConfirm = hasSelection && !hasCustomInput;

  if (isSimpleConfirm) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
        bg-emerald-50 border border-emerald-200/60 text-emerald-700
        text-xs font-medium select-none">
        <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
        <span>{selectedLabels.join("、")}</span>
      </div>
    );
  }

  // 带自定义反馈的响应
  return (
    <div
      className="rounded-2xl max-w-[80%] overflow-hidden border border-black/[0.06] bg-white/95 backdrop-blur-xl"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 14px rgba(0,0,0,0.06)' }}
    >
      {hasSelection && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5 pb-2">
          {selectedLabels.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] font-medium"
            >
              <Check className="w-3 h-3" strokeWidth={2.5} />
              {label}
            </span>
          ))}
        </div>
      )}

      {hasCustomInput && (
        <div className="px-4 py-3 bg-gray-50/50">
          <p className="text-[13px] text-gray-700 leading-relaxed">{customInput}</p>
        </div>
      )}

      {!hasSelection && !hasCustomInput && (
        <div className="px-4 py-3 bg-gray-50/50">
          <p className="text-[13px] text-gray-700 leading-relaxed">{message.content}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 折叠状态的内容卡片（确认后的历史展示）
 */
export function CollapsedContentCard({ data }: { data: HITLContentData }) {
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);
  const shouldTruncate = data.body.length > MAX_PREVIEW_LENGTH;
  const displayBody = shouldTruncate && !isBodyExpanded
    ? data.body.slice(0, MAX_PREVIEW_LENGTH) + "..."
    : data.body;

  return (
    <div
      className="rounded-2xl border border-black/[0.06] bg-white/95 backdrop-blur-xl overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 14px rgba(0,0,0,0.06), 0 16px 40px -8px rgba(0,0,0,0.08)' }}
    >
      {/* 标题 */}
      <div className="px-5 pt-4 pb-1.5">
        <h4 className="text-[14px] font-semibold text-gray-900 leading-snug tracking-[-0.01em]">{data.title}</h4>
      </div>

      {/* 正文 */}
      {data.body && (
        <div className="px-5 pb-3">
          <p className="text-[13px] text-gray-500 whitespace-pre-wrap leading-[1.7]">
            {displayBody}
          </p>
          {shouldTruncate && (
            <button
              onClick={() => setIsBodyExpanded(!isBodyExpanded)}
              className="inline-flex items-center gap-0.5 mt-2 text-[12px] text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              {isBodyExpanded ? (
                <>收起 <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>展开全文 <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* 标签 */}
      {data.tags.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-1.5">
          {data.tags.map((tag, i) => (
            <span
              key={i}
              className="inline-block px-2.5 py-[3px] rounded-full bg-violet-500/[0.08] text-violet-600 text-[11px] font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 选项项组件（静态展示）
 */
function OptionItem({ option, isSelected }: { option: AskUserOption; isSelected: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
        isSelected
          ? "bg-white border-amber-400 shadow-sm shadow-amber-100"
          : "bg-white/80 border-transparent"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          isSelected 
            ? "border-amber-500 bg-gradient-to-br from-amber-400 to-orange-400" 
            : "border-gray-300"
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
          {option.label}
        </p>
        {option.description && (
          <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
        )}
      </div>
    </div>
  );
}

/**
 * 判断消息是否是 HITL 请求
 */
export function isHITLRequest(message: ChatMessage): boolean {
  return message.role === "assistant" && !!message.askUser;
}

/**
 * 判断消息是否是 HITL 响应
 */
export function isHITLResponse(message: ChatMessage): boolean {
  return message.role === "user" && !!message.askUserResponse;
}

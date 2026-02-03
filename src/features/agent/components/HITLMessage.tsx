/**
 * HITL 交互消息组件
 * 在对话流中展示 human-in-the-loop 交互历史
 */

import { useState } from "react";
import { Check, MessageSquare, Edit3 } from "lucide-react";
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

/**
 * 可交互的 HITL 气泡组件（当前正在等待用户响应）
 */
export function InteractiveHITLBubble({ state, onStateChange, onSubmit }: InteractiveHITLProps) {
  const [customInput, setCustomInput] = useState(state.customInput || "");
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const isContentConfirm = !!(state.context as any)?.__hitl;

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

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-[80%]">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
          <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <span className="text-sm font-medium text-amber-700">
          {isContentConfirm ? "内容确认" : "需要您的选择"}
        </span>
      </div>

      {/* 问题 */}
      <p className="text-sm text-gray-700 mb-3">{state.question}</p>

      {/* 可点击的选项列表 */}
      {state.options.length > 0 && (
        <div className="space-y-2">
          {state.options.map((option) => (
            <InteractiveOptionItem
              key={option.id}
              option={option}
              isSelected={state.selectedIds.includes(option.id)}
              onClick={() => handleOptionSelect(option.id)}
            />
          ))}
        </div>
      )}

      {/* 反馈输入框（仅在选择"重生成"时显示） */}
      {needsFeedback && (
        <div className="mt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Edit3 className="w-3 h-3" />
            <span>请告诉我需要改进的地方</span>
          </div>
          <textarea
            value={customInput}
            onChange={(e) => handleCustomInputChange(e.target.value)}
            placeholder="例如：标题太平淡了，需要更有吸引力..."
            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none bg-white"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowFeedbackInput(false);
                setCustomInput("");
                onStateChange({ ...state, selectedIds: [], customInput: "" });
              }}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!customInput.trim()}
              className="px-4 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              提交反馈
            </button>
          </div>
        </div>
      )}

      {/* 普通选项的确认按钮（非 approve/reject 时显示） */}
      {selectedId && selectedId !== "approve" && selectedId !== "reject" && !needsFeedback && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onSubmit}
            className="px-5 py-2 bg-gradient-to-r from-gray-800 to-gray-900 text-white text-sm font-medium rounded-xl hover:from-gray-900 hover:to-black transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            确认选择
          </button>
        </div>
      )}
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
  
  if (!askUserResponse) {
    // 普通用户消息
    return (
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-2xl px-5 py-3.5 max-w-[70%] shadow-md">
        <p className="text-sm leading-relaxed">{message.content}</p>
      </div>
    );
  }

  const { selectedLabels, customInput } = askUserResponse;
  const hasSelection = selectedLabels.length > 0;
  const hasCustomInput = customInput && customInput.trim();

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-2xl px-5 py-4 max-w-[80%] shadow-md">
      {/* 选择的选项 */}
      {hasSelection && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedLabels.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 backdrop-blur rounded-full text-xs font-medium"
            >
              <Check className="w-3 h-3 text-green-400" />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* 自定义输入 */}
      {hasCustomInput && (
        <p className="text-sm leading-relaxed">
          {hasSelection && <span className="text-gray-400 mr-1">反馈:</span>}
          {customInput}
        </p>
      )}

      {/* 如果既没有选择也没有自定义输入，显示原始内容 */}
      {!hasSelection && !hasCustomInput && (
        <p className="text-sm leading-relaxed">{message.content}</p>
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

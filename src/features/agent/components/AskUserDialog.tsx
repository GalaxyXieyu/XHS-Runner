/**
 * AskUserDialog - 可复用的 HITL 确认对话框组件
 *
 * 用于显示 Agent 工作流中需要用户确认的对话框
 * 支持单选/多选选项和自定义文本输入
 */

import type { AskUserOption, AskUserDialogState } from "../types";
import { ContextPreviewCard } from "./ContextPreviewCard";

export interface AskUserDialogProps {
  state: AskUserDialogState;
  onStateChange: (state: AskUserDialogState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** 数据属性，用于自动确认功能 */
  submitButtonDataAttr?: string;
}

export function AskUserDialog({
  state,
  onStateChange,
  onSubmit,
  onCancel,
  submitButtonDataAttr,
}: AskUserDialogProps) {
  if (!state.isOpen) return null;

  const handleOptionSelect = (optionId: string) => {
    if (state.selectionType === "single") {
      onStateChange({ ...state, selectedIds: [optionId] });
    } else {
      const newIds = state.selectedIds.includes(optionId)
        ? state.selectedIds.filter(id => id !== optionId)
        : [...state.selectedIds, optionId];
      onStateChange({ ...state, selectedIds: newIds });
    }
  };

  const isSubmitDisabled = 
    state.options.length > 0 && 
    state.selectedIds.length === 0 && 
    !state.customInput;

  return (
    // Non-blocking: keep the ask_user prompt visible but do not block other UI operations
    // (e.g. login expired, user still needs to click around).
    <div className="fixed bottom-4 right-4 z-50 p-2">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-[420px] max-h-[70vh] flex flex-col overflow-hidden border border-gray-100">
        {/* 标题 */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">需要您的确认</h3>
          <button
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="关闭"
          >
            关闭
          </button>
        </div>

        {/* 问题内容 */}
        <div className="px-4 py-3 flex-1 overflow-y-auto">
          <p className="text-gray-700 whitespace-pre-wrap">{state.question}</p>

          {/* 上下文预览 */}
          {state.context && Object.keys(state.context).length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-2 font-medium">当前内容预览</div>
              <ContextPreviewCard context={state.context} />
            </div>
          )}

          {/* 选项列表 */}
          {state.options.length > 0 && (
            <div className="mt-4 space-y-2">
              {state.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleOptionSelect(option.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    state.selectedIds.includes(option.id)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      state.selectedIds.includes(option.id)
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}>
                      {state.selectedIds.includes(option.id) && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800">{option.label}</div>
                      {option.description && (
                        <div className="text-sm text-gray-500 line-clamp-2">{option.description}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 自定义输入 */}
          {state.allowCustomInput && (
            <div className="mt-4">
              <textarea
                value={state.customInput}
                onChange={(e) => onStateChange({ ...state, customInput: e.target.value })}
                placeholder="或者输入您的回复..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                rows={3}
              />
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="px-4 py-3 bg-gray-50 flex justify-end gap-3 flex-shrink-0 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitDisabled}
            className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            {...(submitButtonDataAttr ? { [submitButtonDataAttr]: true } : {})}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 创建初始对话框状态
 */
export function createInitialAskUserState(): AskUserDialogState {
  return {
    isOpen: false,
    question: "",
    options: [],
    selectionType: "single",
    allowCustomInput: false,
    threadId: "",
    context: {},
    selectedIds: [],
    customInput: "",
  };
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { Send, X } from "lucide-react";
import type { AgentEvent, ChatMessage } from "../types";
import type { ContentPackage } from "@/features/material-library/types";
import { NoteDetailModal, type NoteDetailData } from "@/components/NoteDetailModal";
import { processSSEStream, createStreamCallbacks } from "../hooks/useStreamProcessor";
import { AgentCreatorEmptyState } from "./AgentCreatorEmptyState";
import { agentProgressMap } from "./AgentCreatorConfig";
import type { ImageGenProvider } from "./AgentCreatorConfig";

// 子组件
import { InteractiveHITLBubble } from "./HITLMessage";
import { MessageTypeRenderer } from "./Messages/MessageTypeRenderer";
import { useAgentStreamStore } from "../store/agentStreamStore";
import { useConversationStore } from "../store/conversationStore";
import { useShallow } from "zustand/react/shallow";

interface AgentCreatorProps {
  theme: Theme;
  themes?: Theme[];
  onClose?: () => void;
  backLabel?: string;
  initialRequirement?: string;
  autoRunInitialRequirement?: boolean;
}


export function AgentCreator({ theme, initialRequirement, autoRunInitialRequirement, onClose, backLabel }: AgentCreatorProps) {
  // 基础状态
  const [requirement, setRequirement] = useState("");
  const { conversationId, setConversationId } = useConversationStore();

  const {
    messages,
    events,
    imageTasks,
    isStreaming,
    streamStartedAt,
    streamPhase,
    workflowProgress,
    askUserDialog,
    setMessages,
    setEvents,
    setImageTasks,
    setIsStreaming,
    setStreamStartedAt,
    setStreamPhase,
    setWorkflowProgress,
    setAskUserDialog,
    resetStream,
  } = useAgentStreamStore(
    useShallow((state) => ({
      messages: state.messages,
      events: state.events,
      imageTasks: state.imageTasks,
      isStreaming: state.isStreaming,
      streamStartedAt: state.streamStartedAt,
      streamPhase: state.streamPhase,
      workflowProgress: state.workflowProgress,
      askUserDialog: state.askUserDialog,
      setMessages: state.setMessages,
      setEvents: state.setEvents,
      setImageTasks: state.setImageTasks,
      setIsStreaming: state.setIsStreaming,
      setStreamStartedAt: state.setStreamStartedAt,
      setStreamPhase: state.setStreamPhase,
      setWorkflowProgress: state.setWorkflowProgress,
      setAskUserDialog: state.setAskUserDialog,
      resetStream: state.resetStream,
    }))
  );
  
  // UI 状态
  const [imageGenProvider, setImageGenProvider] = useState<ImageGenProvider>('jimeng');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 素材库状态
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<ContentPackage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const hasMessages = messages.length > 0 || isStreaming;

  // When loading conversation history (non-streaming), open a pending ask_user prompt if
  // the last assistant message requires user input and has not been responded to yet.
  useEffect(() => {
    if (isStreaming) return;
    if (askUserDialog.isOpen) return;
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant') return;
    const ask = (last as any).askUser;
    if (!ask || !ask.question || !Array.isArray(ask.options)) return;

    // If user already responded to the latest ask_user, do not re-open.
    // Response is stored as a user message with askUserResponse AFTER the ask_user assistant message.
    const lastAskIdx = (() => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m: any = messages[i];
        if (m?.role === 'assistant' && m.askUser) return i;
      }
      return -1;
    })();
    if (lastAskIdx >= 0) {
      const hasResponseAfter = messages.slice(lastAskIdx + 1).some((m) => (m as any).askUserResponse);
      if (hasResponseAfter) return;
    }

    setAskUserDialog({
      isOpen: true,
      threadId: String(ask.threadId || conversationId || ''),
      question: String(ask.question),
      options: ask.options,
      selectionType: ask.selectionType || 'single',
      allowCustomInput: Boolean(ask.allowCustomInput),
      context: ask.data ? { __hitl: Boolean(ask.isHITL), data: ask.data } : { __hitl: Boolean(ask.isHITL) },
      selectedIds: [],
      customInput: '',
    });
  }, [askUserDialog.isOpen, conversationId, isStreaming, messages, setAskUserDialog]);

  // 转换 ContentPackage 为 NoteDetailData
  const packageToNoteData = useCallback((pkg: ContentPackage): NoteDetailData => ({
    id: pkg.id,
    title: pkg.titles?.[pkg.selectedTitleIndex] || "未命名",
    desc: pkg.content || "",
    images: pkg.images || [],
    tags: pkg.tags || [],
  }), []);

  // 保存编辑后的数据
  const handleSavePackage = useCallback((data: NoteDetailData) => {
    if (!selectedPackage) return;
    setPackages(prev => prev.map(pkg =>
      pkg.id === selectedPackage.id
        ? { ...pkg, titles: [data.title], selectedTitleIndex: 0, content: data.desc, tags: data.tags || [], images: data.images }
        : pkg
    ));
  }, [selectedPackage]);

  // 获取素材库数据
  const fetchPackages = useCallback(async () => {
    setPackagesLoading(true);
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}&withAssets=true&limit=12`);
      if (res.ok) {
        const data = await res.json();
        setPackages(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch packages:", error);
    } finally {
      setPackagesLoading(false);
    }
  }, [theme.id]);

  // 初始加载素材
  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Allow other screens (e.g. scheduled ideas) to pre-fill the requirement.
  useEffect(() => {
    if (typeof initialRequirement === "string" && initialRequirement.trim()) {
      setRequirement(initialRequirement.trim());
    }
  }, [initialRequirement]);

  const autoRunOnceRef = useRef<string | null>(null);
  const autoConfirmOnceRef = useRef<string | null>(null);
  const autoConfirmLoopGuardRef = useRef<{ sig: string; count: number; firstAt: number } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 自动继续逻辑（autoConfirm）
  // - 优先选 approve；否则选第一个 option
  // - 防止同一 ask_user 反复弹窗导致无限自动点击：加 loop guard
  useEffect(() => {
    if (!autoConfirm || !askUserDialog.isOpen) {
      autoConfirmOnceRef.current = null;
      return;
    }

    const isHITL = !!(askUserDialog.context as any)?.__hitl;
    const threadId = askUserDialog.threadId || "default";
    const optionIds = (askUserDialog.options || []).map((o) => o.id).join(",");
    const question = String((askUserDialog as any).question || "");

    // Use a richer signature than threadId only; ask_user can reopen with different options in the same thread.
    const sig = `${threadId}::${isHITL ? "hitl" : "ask"}::${optionIds}::${question}`;
    if (autoConfirmOnceRef.current === sig) return;

    // Auto-confirm heuristic:
    // - Prefer explicit approve
    // - Otherwise pick the first option (user preference; may be risky for branching questions)
    const approveOpt = askUserDialog.options.find((opt) => opt.id === "approve");
    const chosen = approveOpt?.id || askUserDialog.options[0]?.id;
    if (!chosen) return;

    // Loop guard: if the same ask_user keeps re-opening, stop auto-confirming.
    const now = Date.now();
    const guard = autoConfirmLoopGuardRef.current;
    if (!guard || guard.sig !== sig || now - guard.firstAt > 60_000) {
      autoConfirmLoopGuardRef.current = { sig, count: 1, firstAt: now };
    } else {
      guard.count += 1;
      if (guard.count > 5) {
        console.warn('[autoConfirm] loop guard triggered, stop auto-confirm for sig:', sig);
        return;
      }
    }

    autoConfirmOnceRef.current = sig;

    const timer = setTimeout(() => {
      setAskUserDialog((prev) => (
        prev.selectedIds.length === 1 && prev.selectedIds[0] === chosen
          ? prev
          : { ...prev, selectedIds: [chosen] }
      ));

      // Give state a moment to settle; handleAskUserSubmit reads from store.getState().
      setTimeout(() => handleAskUserSubmit(), 150);
    }, 350);

    return () => clearTimeout(timer);
  }, [autoConfirm, askUserDialog.isOpen, askUserDialog.threadId, askUserDialog.options, askUserDialog.question, askUserDialog.context]);

  // 根据事件更新阶段提示和进度
  const updatePhase = useCallback((event: AgentEvent) => {
    if (event.type === "agent_start") {
      const progress = agentProgressMap[event.agent || ""] || 0;
      if (progress > 0) setWorkflowProgress(progress);
      
      const phaseMap: Record<string, string> = {
        brief_compiler_agent: "正在梳理任务...",
        research_agent: "正在提取研究证据...",
        reference_intelligence_agent: "正在解析参考图...",
        layout_planner_agent: "正在规划版式...",
        writer_agent: "正在创作文案...",
        image_agent: "正在生成图片...",
        image_planner_agent: "正在规划图片...",
        review_agent: "正在审核内容...",
        supervisor: "正在规划任务...",
      };
      if (event.agent && phaseMap[event.agent]) {
        setStreamPhase(phaseMap[event.agent]);
      }
    } else if (event.type === "agent_end") {
      const progress = agentProgressMap[event.agent || ""] || 0;
      if (progress > 0) setWorkflowProgress(Math.min(100, progress + 5));
    } else if (event.type === "progress") {
      setStreamPhase(event.content);
    } else if (event.type === "tool_call") {
      const toolPhaseMap: Record<string, string> = {
        search_notes: "搜索相关笔记...",
        analyze_tags: "分析热门标签...",
        get_top_titles: "获取爆款标题...",
        generate_images: "批量生成封面图...",
      };
      if (event.tool && toolPhaseMap[event.tool]) {
        setStreamPhase(toolPhaseMap[event.tool]);
      }
    }
  }, [setStreamPhase, setWorkflowProgress]);

  // 创建流处理回调
  const createCallbacks = useCallback(() => {
    return createStreamCallbacks(
      { setEvents, setMessages, setImageTasks, setIsStreaming, setStreamPhase, setAskUserDialog },
      { updatePhase, onConversationId: setConversationId }
    );
  }, [setAskUserDialog, setEvents, setImageTasks, setIsStreaming, setMessages, setStreamPhase, updatePhase, setConversationId]);

  const submitMessage = useCallback(async (userMessage: string, source: string) => {
    if (!userMessage.trim() || isStreaming) return;

    const message = userMessage.trim();
    setRequirement("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    setEvents([]);
    setImageTasks([]);
    setWorkflowProgress(0);
    setConversationId(null); // 重置对话 ID，新对话会从后端获取
    setStreamStartedAt(Date.now());
    setIsStreaming(true);
    setStreamPhase("正在规划任务...");

    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          themeId: theme.id,
          imageGenProvider,
          enableHITL: true,
          fastMode,
        }),
      });

      await processSSEStream(response, createCallbacks(), {
        resetEvents: true,
        source,
      });
    } catch (error) {
      console.error("Stream error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      setMessages(prev => [...prev, {
        role: "assistant",
        content: errorMessage.includes("超时")
          ? `连接超时，请检查网络后重试。${errorMessage}`
          : `连接错误：${errorMessage}。请重试。`
      }]);
    } finally {
      setIsStreaming(false);
      setStreamStartedAt(null);
      setStreamPhase("");
      fetchPackages();
    }
  }, [createCallbacks, fetchPackages, imageGenProvider, isStreaming, theme.id]);

  // Optionally auto-run the pre-filled requirement (used by "Rerun" from scheduled ideas).
  useEffect(() => {
    const message = (initialRequirement || '').trim();
    if (!autoRunInitialRequirement || !message) return;
    if (isStreaming) return;
    if (messages.length > 0) return;

    if (autoRunOnceRef.current === message) return;
    autoRunOnceRef.current = message;

    // Fire-and-forget: submitMessage manages streaming state + UI.
    submitMessage(message, 'autoRunInitialRequirement');
  }, [autoRunInitialRequirement, initialRequirement, isStreaming, messages.length, submitMessage]);

  // 提交请求
  const handleSubmit = async () => {
    if (!requirement.trim() || isStreaming) return;
    await submitMessage(requirement, "handleSubmit");
  };

  // 提交 askUser 响应
  const handleAskUserSubmit = async () => {
    // 使用 getState() 获取最新状态，避免 setTimeout 闭包问题
    const currentDialog = useAgentStreamStore.getState().askUserDialog;
    if (!currentDialog.threadId) return;

    const isHITLConfirm = !!(currentDialog.context as any)?.__hitl;

    let requestBody: any;
    if (isHITLConfirm) {
      const selectedId = currentDialog.selectedIds[0];
      const feedback = (currentDialog.customInput || "").trim();

      if (selectedId === "reject" && !feedback) {
        window.alert("要重生成的话，写一句建议会更好哦");
        return;
      }

      requestBody = {
        threadId: currentDialog.threadId,
        action: selectedId === "reject" ? "reject" : "approve",
        ...(selectedId === "reject" ? { userFeedback: feedback } : {}),
      };
    } else {
      requestBody = {
        threadId: currentDialog.threadId,
        userResponse: {
          selectedIds: currentDialog.selectedIds,
          customInput: (currentDialog.customInput || "").trim() || undefined,
        },
      };
    }

    setAskUserDialog(prev => ({ ...prev, isOpen: false }));

    const customInput = (currentDialog.customInput || "").trim();
    const selectedLabelsList = currentDialog.options
      .filter(opt => currentDialog.selectedIds.includes(opt.id))
      .map(opt => opt.label);

    // 添加紧凑的用户选择记录，同时保存 HITL context（文案/图片规划）以便历史回溯
    const isHITLWithContent = !!(currentDialog.context as any)?.__hitl && (currentDialog.context as any)?.data;
    setMessages(prev => [
      ...prev,
      {
        role: "user" as const,
        content: customInput || selectedLabelsList.join(", ") || "继续",
        askUserResponse: {
          selectedIds: currentDialog.selectedIds,
          selectedLabels: selectedLabelsList,
          customInput: customInput || undefined,
          ...(isHITLWithContent ? { context: currentDialog.context } : {}),
        },
      },
    ]);

    // 添加分隔事件，标记继续点
    setEvents(prev => [...prev, {
      type: "message",
      agent: "supervisor",
      content: `▸ 用户选择: ${selectedLabelsList.join(", ") || "继续"}`,
      timestamp: Date.now(),
    } as any]);

    try {
      setStreamStartedAt(Date.now());
      setIsStreaming(true);
      setStreamPhase("继续处理中...");

      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Failed to submit response");

      // resetEvents: false 保留之前的事件
      await processSSEStream(res, createCallbacks(), { resetEvents: false, source: "handleAskUserSubmit" });
    } catch (error) {
      console.error("Confirm error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: errorMessage.includes("超时") 
          ? "连接超时，请检查网络后重试。" 
          : `响应提交失败：${errorMessage}。请重试。`
      }]);
    } finally {
      setIsStreaming(false);
      setStreamStartedAt(null);
      setStreamPhase("");
      fetchPackages();
    }
  };

  // 处理选项选择
  const handleOptionSelect = (optionId: string) => {
    if (askUserDialog.selectionType === "single") {
      setAskUserDialog(prev => ({ ...prev, selectedIds: [optionId] }));
    } else {
      setAskUserDialog(prev => ({
        ...prev,
        selectedIds: prev.selectedIds.includes(optionId)
          ? prev.selectedIds.filter(id => id !== optionId)
          : [...prev.selectedIds, optionId],
      }));
    }
  };

  // hasTerminalEventInCurrentStream 和 shouldShowProcessingCard 已移除
  // 旧的 "Agent流处理中" 卡片被 AgentTimelineView 取代


  return (
    <div className="h-full flex flex-col bg-white overflow-x-hidden relative">
      {/* 初始状态布局 */}
      {!hasMessages && (
        <AgentCreatorEmptyState
          themeId={theme.id}
          requirement={requirement}
          setRequirement={setRequirement}
          handleSubmit={handleSubmit}
          isStreaming={isStreaming}
          imageGenProvider={imageGenProvider}
          setImageGenProvider={setImageGenProvider}
          autoConfirm={autoConfirm}
          setAutoConfirm={setAutoConfirm}
          fastMode={fastMode}
          setFastMode={setFastMode}
          packages={packages}
          packagesLoading={packagesLoading}
          setSelectedPackage={setSelectedPackage}
        />
      )}

      {/* 有消息时的布局 */}
      {hasMessages && (
        <>
          {/* 进度条（streaming 时显示） */}
          {isStreaming && workflowProgress > 0 && (
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-blue-500 transition-[width] duration-300"
                style={{ width: `${workflowProgress}%` }}
              />
            </div>
          )}

          {/* 顶部工具条 */}
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAutoConfirm(!autoConfirm)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                autoConfirm
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              自动继续
            </button>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-4">
              {messages.map((msg, idx) => {
                const nextMessageRole = messages[idx + 1]?.role;
                const hasLaterAssistant = messages.slice(idx + 1).some((m) => m.role === 'assistant');
                return (
                  <div key={idx} className="space-y-3">
                    <MessageTypeRenderer
                      message={msg}
                      index={idx}
                      total={messages.length}
                      hasLaterAssistant={hasLaterAssistant}
                      isStreaming={isStreaming}
                      liveEvents={events}
                      imageTasks={imageTasks}
                      streamPhase={streamPhase}
                      onImageClick={setPreviewImage}
                      nextMessageRole={nextMessageRole}
                    />
                  </div>
                );
              })}


              {/* 可交互的 HITL 气泡（等待用户响应时显示） */}
              {askUserDialog.isOpen && (
                <InteractiveHITLBubble
                  state={askUserDialog}
                  onStateChange={setAskUserDialog}
                  onSubmit={handleAskUserSubmit}
                />
              )}

              {/* 思考中状态（用户确认后、等待后端响应时显示） */}
              {isStreaming && !askUserDialog.isOpen && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex items-center gap-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-400">{streamPhase || '思考中...'}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

          {/* 悬浮输入框 */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
            <div className="max-w-3xl mx-auto pointer-events-auto">
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-sm">
                <input
                  type="text"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                  placeholder="发起新生成（会重置上下文）"
                  aria-label="新任务输入框"
                  className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent focus-visible:outline-none"
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming || !requirement.trim()}
                  aria-label="发送消息"
                  className="w-9 h-9 rounded-xl bg-gradient-to-r from-gray-800 to-gray-900 text-white flex items-center justify-center hover:from-gray-900 hover:to-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors transition-transform transition-shadow duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 素材详情弹窗 */}
      <NoteDetailModal
        note={selectedPackage ? packageToNoteData(selectedPackage) : null}
        open={!!selectedPackage}
        onClose={() => setSelectedPackage(null)}
        editable={true}
        hideSocialFeatures={true}
        onSave={handleSavePackage}
      />

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            aria-label="关闭图片预览"
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={previewImage}
            alt="预览大图"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}

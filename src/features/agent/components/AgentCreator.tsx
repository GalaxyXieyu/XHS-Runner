"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { ArrowLeft, Send, X } from "lucide-react";
import type { AgentEvent, ChatMessage } from "../types";
import type { ContentPackage } from "@/features/material-library/types";
import { NoteDetailModal, type NoteDetailData } from "@/components/NoteDetailModal";
import { processSSEStream, createStreamCallbacks } from "../hooks/useStreamProcessor";
import { AgentCreatorEmptyState } from "./AgentCreatorEmptyState";
import { agentProgressMap } from "./AgentCreatorConfig";
import type { ImageGenProvider } from "./AgentCreatorConfig";

// 子组件
import { InteractiveHITLBubble } from "./HITLMessage";
import { ConversationHistory } from "./ConversationHistory";
import { MessageTypeRenderer } from "./Messages/MessageTypeRenderer";
import { useAgentStreamStore } from "../store/agentStreamStore";
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
  const [conversationId, setConversationId] = useState<number | null>(null);

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

  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 素材库状态
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<ContentPackage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const hasMessages = messages.length > 0 || isStreaming;

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 自动继续逻辑
  useEffect(() => {
    if (!autoConfirm || !askUserDialog.isOpen) {
      autoConfirmOnceRef.current = null;
      return;
    }

    const isHITL = !!(askUserDialog.context as any)?.__hitl;
    if (!isHITL) return;

    const currentThreadId = askUserDialog.threadId || "default";
    if (autoConfirmOnceRef.current === currentThreadId) return;
    autoConfirmOnceRef.current = currentThreadId;

    const timer = setTimeout(() => {
      const approveOption = askUserDialog.options.find(opt => opt.id === "approve");
      if (!approveOption) return;

      setAskUserDialog(prev => (
        prev.selectedIds.includes("approve")
          ? prev
          : { ...prev, selectedIds: ["approve"] }
      ));
      setTimeout(() => handleAskUserSubmit(), 100);
    }, 500);

    return () => clearTimeout(timer);
  }, [autoConfirm, askUserDialog.isOpen, askUserDialog.threadId]);

  // 根据事件更新阶段提示和进度
  const updatePhase = useCallback((event: AgentEvent) => {
    if (event.type === "agent_start") {
      const progress = agentProgressMap[event.agent || ""] || 0;
      if (progress > 0) setWorkflowProgress(progress);
      
      const phaseMap: Record<string, string> = {
        brief_compiler_agent: "正在梳理任务...",
        research_evidence_agent: "正在提取研究证据...",
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
  }, [setAskUserDialog, setEvents, setImageTasks, setIsStreaming, setMessages, setStreamPhase, updatePhase]);

  // 加载历史对话
  const loadConversation = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error('Failed to load conversation');

      const data = await res.json();
      setConversationId(data.id);

      // 转换消息格式
      const loadedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        agent: msg.agent,
        events: msg.events,
        askUser: msg.askUser,
        askUserResponse: msg.askUserResponse,
      }));

      resetStream();
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, [resetStream, setMessages]);

  // 开始新对话
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    resetStream();
  }, [resetStream]);

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
    if (!askUserDialog.threadId) return;

    const isHITLConfirm = !!(askUserDialog.context as any)?.__hitl;
    const selectedLabels = askUserDialog.options
      .filter(opt => askUserDialog.selectedIds.includes(opt.id))
      .map(opt => opt.label)
      .join(", ");

    let requestBody: any;
    if (isHITLConfirm) {
      const selectedId = askUserDialog.selectedIds[0];
      const feedback = (askUserDialog.customInput || "").trim();

      if (selectedId === "reject" && !feedback) {
        window.alert("要重生成的话，写一句建议会更好哦");
        return;
      }

      requestBody = {
        threadId: askUserDialog.threadId,
        action: selectedId === "reject" ? "reject" : "approve",
        ...(selectedId === "reject" ? { userFeedback: feedback } : {}),
      };
    } else {
      requestBody = {
        threadId: askUserDialog.threadId,
        userResponse: {
          selectedIds: askUserDialog.selectedIds,
          customInput: (askUserDialog.customInput || "").trim() || undefined,
        },
      };
    }

    setAskUserDialog(prev => ({ ...prev, isOpen: false }));

    const customInput = (askUserDialog.customInput || "").trim();
    const selectedLabelsList = askUserDialog.options
      .filter(opt => askUserDialog.selectedIds.includes(opt.id))
      .map(opt => opt.label);

    // 添加紧凑的用户选择记录，同时保存 HITL context（文案/图片规划）以便历史回溯
    const isHITLWithContent = !!(askUserDialog.context as any)?.__hitl && (askUserDialog.context as any)?.data;
    setMessages(prev => [
      ...prev,
      {
        role: "user" as const,
        content: customInput || selectedLabelsList.join(", ") || "继续",
        askUserResponse: {
          selectedIds: askUserDialog.selectedIds,
          selectedLabels: selectedLabelsList,
          customInput: customInput || undefined,
          ...(isHITLWithContent ? { context: askUserDialog.context } : {}),
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
          onClose={onClose}
          backLabel={backLabel}
          themeId={theme.id}
          conversationId={conversationId}
          loadConversation={loadConversation}
          startNewConversation={startNewConversation}
          requirement={requirement}
          setRequirement={setRequirement}
          handleSubmit={handleSubmit}
          isStreaming={isStreaming}
          imageGenProvider={imageGenProvider}
          setImageGenProvider={setImageGenProvider}
          autoConfirm={autoConfirm}
          setAutoConfirm={setAutoConfirm}
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

          {/* 右上角悬浮按钮组 - 默认低调，hover 显现 */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity duration-200 bg-white/70 backdrop-blur-sm rounded-xl px-1.5 py-1 shadow-sm">
            {onClose && backLabel ? (
              <button
                onClick={onClose}
                className="h-9 px-3 rounded-xl bg-white/90 backdrop-blur text-gray-700 hover:bg-gray-100 shadow-md shadow-gray-200/50 ring-1 ring-gray-100 text-xs flex items-center"
                title={backLabel}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {backLabel}
              </button>
            ) : onClose ? (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/90 backdrop-blur text-gray-500 hover:text-gray-700 hover:bg-gray-100 shadow-md shadow-gray-200/50 ring-1 ring-gray-100"
                title="返回"
                aria-label="返回"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}

            {/* 历史对话按钮 */}
            <ConversationHistory
              themeId={theme.id}
              currentConversationId={conversationId}
              onSelect={loadConversation}
              onNewConversation={startNewConversation}
              compact
            />

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

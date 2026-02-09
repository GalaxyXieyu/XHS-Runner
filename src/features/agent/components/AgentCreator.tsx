"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { ArrowLeft, Send, X } from "lucide-react";
import type { AgentEvent, ChatMessage, ImageTask, AskUserDialogState } from "../types";
import type { ContentPackage } from "@/features/material-library/types";
import { NoteDetailModal, type NoteDetailData } from "@/components/NoteDetailModal";
import { Markdown } from "@/components/ui/markdown";
import { processSSEStream, createStreamCallbacks } from "../hooks/useStreamProcessor";
import { AgentCreatorEmptyState } from "./AgentCreatorEmptyState";
import { agentProgressMap, getAgentDisplayName } from "./AgentCreatorConfig";
import type { ImageGenProvider } from "./AgentCreatorConfig";

// 子组件
import { createInitialAskUserState } from "./AskUserDialog";
import { CollapsibleToolCard } from "./ToolEventList";
import { ContentCard, parseCreativeContent } from "./ContentCard";
import { ImagePlanCard, parseImagePlanContent } from "./ImagePlanCard";
import { HITLRequestMessage, HITLResponseMessage, isHITLRequest, InteractiveHITLBubble } from "./HITLMessage";
import { ConversationHistory } from "./ConversationHistory";
import {
  getAgentStates,
  SupervisorRouteCard,
  AgentWorkingCard,
  AgentCompletedCard,
  type AgentState,
} from "./AgentStatusCards";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamPhase, setStreamPhase] = useState<string>("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  
  // UI 状态
  const [expandedLoading, setExpandedLoading] = useState(true);
  const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);
  const [imageGenProvider, setImageGenProvider] = useState<ImageGenProvider>('jimeng');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedOutputItems, setExpandedOutputItems] = useState<Record<string, boolean>>({});

  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 素材库状态
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<ContentPackage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // askUser 对话框状态
  const [askUserDialog, setAskUserDialog] = useState<AskUserDialogState>(createInitialAskUserState());

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 自动继续逻辑
  useEffect(() => {
    if (autoConfirm && askUserDialog.isOpen) {
      const isHITL = !!(askUserDialog.context as any)?.__hitl;
      if (isHITL) {
        const timer = setTimeout(() => {
          const approveOption = askUserDialog.options.find(opt => opt.id === "approve");
          if (approveOption) {
            setAskUserDialog(prev => ({ ...prev, selectedIds: ["approve"] }));
            setTimeout(() => handleAskUserSubmit(), 100);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [autoConfirm, askUserDialog.isOpen, askUserDialog.context, askUserDialog.options]);

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
        research_agent: "正在检索相关内容...",
        writer_agent: "正在创作文案...",
        image_agent: "正在生成图片...",
        image_planner_agent: "正在规划图片...",
        style_analyzer_agent: "正在分析风格...",
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
  }, []);

  // 创建流处理回调
  const createCallbacks = useCallback(() => {
    return createStreamCallbacks(
      { setEvents, setMessages, setImageTasks, setIsStreaming, setStreamPhase, setAskUserDialog },
      { updatePhase, onConversationId: setConversationId }
    );
  }, [updatePhase]);

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

      setMessages(loadedMessages);
      setEvents([]);
      setImageTasks([]);
      setAskUserDialog(createInitialAskUserState()); // 重置交互对话框状态
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  // 开始新对话
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setEvents([]);
    setImageTasks([]);
    setWorkflowProgress(0);
    setAskUserDialog(createInitialAskUserState());
  }, []);

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
    
    // 构建用户响应消息，包含详细的选择信息
    const customInput = (askUserDialog.customInput || "").trim();
    const userResponseText = customInput || selectedLabels || (isHITLConfirm ? "继续" : "已确认");
    const selectedLabelsList = askUserDialog.options
      .filter(opt => askUserDialog.selectedIds.includes(opt.id))
      .map(opt => opt.label);
    
    // 先添加 agent 的问题消息，再添加用户的响应，保持完整的对话历史
    setMessages(prev => [
      ...prev,
      // Agent 的问题
      {
        role: "assistant" as const,
        content: askUserDialog.question,
        askUser: {
          question: askUserDialog.question,
          options: askUserDialog.options,
          selectionType: askUserDialog.selectionType,
          allowCustomInput: askUserDialog.allowCustomInput,
          isHITL: isHITLConfirm,
        },
      },
      // 用户的响应
      { 
        role: "user" as const, 
        content: userResponseText,
        askUserResponse: {
          selectedIds: askUserDialog.selectedIds,
          selectedLabels: selectedLabelsList,
          customInput: customInput || undefined,
        },
      },
    ]);

    // 添加分隔事件，标记继续点
    setEvents(prev => [...prev, { 
      type: "message",
      agent: "supervisor", 
      content: "▸ 用户确认继续，开始下一阶段...",
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

  type OutputItem = {
    key: string;
    title: string;
    agentKey: string;
    agentLabel: string;
    timestamp: number;
    render: (isLatest: boolean, expanded: boolean, onToggle: () => void) => JSX.Element;
  };

  const toggleOutputItem = (key: string) => {
    setExpandedOutputItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isOutputExpanded = (key: string, defaultExpanded = false) => {
    const value = expandedOutputItems[key];
    return typeof value === 'boolean' ? value : defaultExpanded;
  };

  // 渲染消息内容
  const renderMessageContent = (msg: ChatMessage, idx: number) => {
    const msgEvents = msg.events || [];
    const isCurrentlyStreaming = isStreaming && idx === messages.length - 1;
    const effectiveEvents = isCurrentlyStreaming ? events : msgEvents;

    // 获取 agent 状态（解决"开始和完成同时出现"的问题）
    const agentStates = getAgentStates(effectiveEvents);

    // Supervisor 路由决策事件
    const supervisorDecisions = effectiveEvents.filter(e => e.type === 'supervisor_decision');

    const researchEvents = effectiveEvents.filter(
      (e) =>
        (e.agent === "research_agent" || e.agent === "research_evidence_agent") &&
        e.type === "message"
    );
    const writerEvents = effectiveEvents.filter(e => e.agent === "writer_agent" && e.type === "message");
    const imagePlannerEvents = effectiveEvents.filter(e => e.agent === "image_planner_agent" && e.type === "message");
    const workflowCompleteEvent = effectiveEvents.find(e => e.type === "workflow_complete") as AgentEvent | undefined;

    // 判断是否为历史消息（非当前流式传输的消息）
    const isHistoricalMessage = !isStreaming || idx < messages.length - 1;

    const researchContent = researchEvents.length > 0
      ? researchEvents[researchEvents.length - 1]?.content || ""
      : "";

    // 优先使用 workflow_complete 事件的内容，否则使用 writer_agent 的内容
    let parsed: ReturnType<typeof parseCreativeContent> = null;
    if (workflowCompleteEvent && (workflowCompleteEvent.title || workflowCompleteEvent.body)) {
      // 从 workflow_complete 事件直接构建内容
      parsed = {
        title: workflowCompleteEvent.title || "",
        body: workflowCompleteEvent.body || "",
        tags: workflowCompleteEvent.tags || [],
      };
    } else {
      const writerContent = writerEvents.map(e => e.content).join("\n");
      parsed = parseCreativeContent(writerContent);
    }

    // 对于历史消息，如果 parsed 为空但有 msg.content，尝试从 content 解析（启用回退模式）
    if (!parsed && isHistoricalMessage && msg.content) {
      parsed = parseCreativeContent(msg.content, true);
    }

    const imagePlannerContent = imagePlannerEvents.map(e => e.content).join("\n");
    const parsedImagePlan = parseImagePlanContent(imagePlannerContent);

    const toolEvents = effectiveEvents.filter(e => e.type === "tool_call" || e.type === "tool_result");
    const isLastAssistantMessage = idx === messages.length - 1 || 
      (idx < messages.length - 1 && messages[idx + 1].role !== 'assistant');
    const isWorkflowComplete = !!workflowCompleteEvent;
    const isHITLRequest = !!msg.askUser; // 是否是 HITL 请求消息
    const shouldIncludeResearch = researchContent || toolEvents.length > 0;

    // 只有满足以下条件才显示图片：
    // 1. workflow_complete 事件存在（最终结果）
    // 2. 或者是最后一条 assistant 消息且正在流式传输（实时进度）
    // 3. 或者是历史消息中的最后一条 assistant 消息，且不是 HITL 请求（已完成的工作流）
    const shouldShowImages = isWorkflowComplete || 
      (isCurrentlyStreaming && isLastAssistantMessage) ||
      (isHistoricalMessage && isLastAssistantMessage && !isHITLRequest);

    // 如果有 workflow_complete 事件，使用其中的图片 asset IDs
    // 中间步骤（如 HITL 确认）不显示图片
    const finalImageTasks = shouldShowImages
      ? (workflowCompleteEvent?.imageAssetIds?.length
          ? workflowCompleteEvent.imageAssetIds.map((assetId: number, i: number) => ({
              id: i + 1,
              prompt: "",
              status: "done" as const,
              assetId,
            }))
          : imageTasks)
      : [];

    const findLastEvent = (predicate: (event: AgentEvent) => boolean) => {
      for (let i = effectiveEvents.length - 1; i >= 0; i -= 1) {
        const event = effectiveEvents[i];
        if (predicate(event)) return event;
      }
      return null;
    };

    const briefState = agentStates.get('brief_compiler_agent');
    const layoutState = agentStates.get('layout_planner_agent');
    const imagePlannerState = agentStates.get('image_planner_agent');
    const reviewState = agentStates.get('review_agent');
    const writerState = agentStates.get('writer_agent');
    const researchState = agentStates.get('research_evidence_agent') || agentStates.get('research_agent');

    const briefTimestamp = findLastEvent((event) => event.type === 'brief_ready')?.timestamp
      || briefState?.endTime
      || 0;
    const layoutTimestamp = findLastEvent((event) => event.type === 'layout_spec_ready')?.timestamp
      || layoutState?.endTime
      || 0;
    const alignmentTimestamp = findLastEvent((event) => event.type === 'alignment_map_ready')?.timestamp
      || imagePlannerState?.endTime
      || 0;
    const reviewTimestamp = findLastEvent((event) => event.type === 'quality_score')?.timestamp
      || reviewState?.endTime
      || 0;
    const researchTimestamp = researchState?.endTime
      || researchEvents[researchEvents.length - 1]?.timestamp
      || 0;
    const writerTimestamp = workflowCompleteEvent?.timestamp
      || writerState?.endTime
      || writerEvents[writerEvents.length - 1]?.timestamp
      || 0;
    const imagePlanTimestamp = imagePlannerEvents[imagePlannerEvents.length - 1]?.timestamp
      || imagePlannerState?.endTime
      || 0;

    const outputItems: OutputItem[] = [];
    const pushOutput = (item: OutputItem) => {
      if (!Number.isFinite(item.timestamp) || item.timestamp <= 0) return;
      outputItems.push(item);
    };

    if (briefState?.result) {
      pushOutput({
        key: 'brief',
        title: 'Brief',
        agentKey: briefState.agent || 'brief_compiler_agent',
        agentLabel: getAgentDisplayName(briefState.agent || 'brief_compiler_agent'),
        timestamp: briefTimestamp,
        render: (_isLatest, expanded, onToggle) => (
          <AgentCompletedCard
            state={briefState}
            expanded={expanded}
            onToggle={onToggle}
          />
        ),
      });
    }

    if (shouldIncludeResearch) {
      pushOutput({
        key: 'research',
        title: '研究过程',
        agentKey: researchState?.agent || 'research_evidence_agent',
        agentLabel: getAgentDisplayName(researchState?.agent || 'research_evidence_agent'),
        timestamp: researchTimestamp,
        render: (isLatest, expanded, onToggle) => (
          <CollapsibleToolCard
            title="研究过程"
            events={effectiveEvents}
            isLoading={isLatest && isCurrentlyStreaming}
            expanded={expanded}
            onToggle={onToggle}
            phase={isLatest && isCurrentlyStreaming ? streamPhase : undefined}
            researchContent={researchContent}
          />
        ),
      });
    }

    if (parsed) {
      pushOutput({
        key: 'content',
        title: isWorkflowComplete ? '创作完成' : '创作输出',
        agentKey: 'writer_agent',
        agentLabel: getAgentDisplayName('writer_agent'),
        timestamp: writerTimestamp,
        render: () => (
          <ContentCard
            content={parsed}
            imageTasks={finalImageTasks}
            isStreaming={isStreaming && !isWorkflowComplete}
            onImageClick={setPreviewImage}
          />
        ),
      });
    }

    if (parsedImagePlan) {
      pushOutput({
        key: 'image_plan',
        title: '图片规划',
        agentKey: imagePlannerState?.agent || 'image_planner_agent',
        agentLabel: getAgentDisplayName(imagePlannerState?.agent || 'image_planner_agent'),
        timestamp: imagePlanTimestamp,
        render: () => (
          <ImagePlanCard imagePlan={parsedImagePlan} />
        ),
      });
    }

    if (layoutState?.result) {
      pushOutput({
        key: 'layout',
        title: '版式规划',
        agentKey: layoutState.agent || 'layout_planner_agent',
        agentLabel: getAgentDisplayName(layoutState.agent || 'layout_planner_agent'),
        timestamp: layoutTimestamp,
        render: (_isLatest, expanded, onToggle) => (
          <AgentCompletedCard
            state={layoutState}
            expanded={expanded}
            onToggle={onToggle}
          />
        ),
      });
    }

    if (imagePlannerState?.result) {
      pushOutput({
        key: 'alignment',
        title: '图文段落绑定',
        agentKey: imagePlannerState.agent || 'image_planner_agent',
        agentLabel: getAgentDisplayName(imagePlannerState.agent || 'image_planner_agent'),
        timestamp: alignmentTimestamp,
        render: (_isLatest, expanded, onToggle) => (
          <AgentCompletedCard
            state={imagePlannerState}
            expanded={expanded}
            onToggle={onToggle}
          />
        ),
      });
    }

    if (reviewState?.result) {
      pushOutput({
        key: 'review',
        title: '质量审核',
        agentKey: reviewState.agent || 'review_agent',
        agentLabel: getAgentDisplayName(reviewState.agent || 'review_agent'),
        timestamp: reviewTimestamp,
        render: (_isLatest, expanded, onToggle) => (
          <AgentCompletedCard
            state={reviewState}
            expanded={expanded}
            onToggle={onToggle}
          />
        ),
      });
    }

    outputItems.sort((a, b) => a.timestamp - b.timestamp);
    const latestOutput = outputItems[outputItems.length - 1];

    type DecisionBlock = {
      key: string;
      decision?: AgentEvent;
      outputs: OutputItem[];
      workingStates: AgentState[];
    };

    type AgentOutputGroup = {
      key: string;
      agentLabel: string;
      outputs: OutputItem[];
      workingStates: AgentState[];
      containsLatest: boolean;
      order: number;
    };

    const decisionEvents = supervisorDecisions;
    const decisionBlocksBase: DecisionBlock[] = decisionEvents.map((event, index) => ({
      key: `decision-${index}`,
      decision: event,
      outputs: [],
      workingStates: [],
    }));

    const preBlock: DecisionBlock = {
      key: 'decision-pre',
      decision: undefined,
      outputs: [],
      workingStates: [],
    };

    const findDecisionIndex = (timestamp: number) => {
      for (let i = decisionEvents.length - 1; i >= 0; i -= 1) {
        if (decisionEvents[i].timestamp <= timestamp) return i;
      }
      return -1;
    };

    const getBlockForTimestamp = (timestamp: number) => {
      if (decisionBlocksBase.length === 0) return preBlock;
      const index = findDecisionIndex(timestamp);
      if (index >= 0) return decisionBlocksBase[index];
      return preBlock;
    };

    outputItems.forEach((item) => {
      const block = getBlockForTimestamp(item.timestamp);
      block.outputs.push(item);
    });

    Array.from(agentStates.values())
      .filter((state) => state.status === 'working')
      .forEach((state) => {
        const block = getBlockForTimestamp(state.startTime);
        block.workingStates.push(state);
      });

    const blocksToRender: DecisionBlock[] = [];
    if (preBlock.outputs.length > 0 || preBlock.workingStates.length > 0 || decisionBlocksBase.length === 0) {
      blocksToRender.push(preBlock);
    }
    blocksToRender.push(...decisionBlocksBase);

    const decisionBlocks = blocksToRender.map((block) => {
      const groupMap = new Map<string, AgentOutputGroup>();

      const ensureGroup = (agentKey: string, agentLabel: string, order: number) => {
        const key = `${block.key}:${agentKey}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            agentLabel,
            outputs: [],
            workingStates: [],
            containsLatest: false,
            order,
          });
        }
        return groupMap.get(key)!;
      };

      block.outputs.forEach((item) => {
        const group = ensureGroup(item.agentKey, item.agentLabel, item.timestamp);
        group.outputs.push(item);
        if (latestOutput && item.key === latestOutput.key) {
          group.containsLatest = true;
        }
      });

      block.workingStates.forEach((state) => {
        const label = getAgentDisplayName(state.agent || '');
        const group = ensureGroup(state.agent || 'unknown', label, state.startTime);
        group.workingStates.push(state);
      });

      const groups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);
      return {
        ...block,
        groups,
      };
    });

    const getBlockActivityTimestamp = (block: typeof decisionBlocks[number]) => {
      let latest = 0;
      block.outputs.forEach((item) => {
        if (item.timestamp > latest) latest = item.timestamp;
      });
      block.workingStates.forEach((state) => {
        if (state.startTime > latest) latest = state.startTime;
      });
      return latest;
    };

    const activeBlocks = decisionBlocks.filter(
      (block) => block.outputs.length > 0 || block.workingStates.length > 0
    );
    const currentBlock = activeBlocks.reduce<typeof decisionBlocks[number] | null>((latest, block) => {
      if (!latest) return block;
      return getBlockActivityTimestamp(block) > getBlockActivityTimestamp(latest) ? block : latest;
    }, null) || decisionBlocks[decisionBlocks.length - 1];
    const historyBlocks = activeBlocks.filter((block) => block.key !== currentBlock?.key);

    const latestDecision = decisionEvents[decisionEvents.length - 1];
    const currentBlockActivityTime = currentBlock ? getBlockActivityTimestamp(currentBlock) : 0;
    const hasUpcomingDecision = !!latestDecision && latestDecision.timestamp > currentBlockActivityTime;

    const getDecisionLabel = (decision?: AgentEvent) => {
      const agentKey = decision?.decision || "";
      return agentKey ? getAgentDisplayName(agentKey) : "准备阶段";
    };

    const renderGroupItems = (group: AgentOutputGroup) => (
      <>
        {group.workingStates.map((state) => (
          <AgentWorkingCard key={`${group.key}-${state.agent}`} state={state} />
        ))}

        {group.outputs.map((item) => {
          const isLatest = latestOutput && item.key === latestOutput.key;
          const outputExpanded = isOutputExpanded(item.key, isLatest);
          const onToggle = () => toggleOutputItem(item.key);
          const showTitle = group.outputs.length > 1;

          return (
            <div key={item.key} className="space-y-1">
              {showTitle && (
                <div className="text-[11px] text-slate-500">{item.title}</div>
              )}
              {item.render(!!isLatest, outputExpanded, onToggle)}
            </div>
          );
        })}
      </>
    );

    const renderCollapsibleGroup = (group: AgentOutputGroup) => {
      const groupStateKey = `agent:${group.key}`;
      const groupExpanded = isOutputExpanded(
        groupStateKey,
        group.containsLatest || group.workingStates.length > 0
      );

      return (
        <div key={group.key} className="rounded-lg border border-slate-200 bg-white/80 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleOutputItem(groupStateKey)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{group.agentLabel}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                {group.workingStates.length > 0
                  ? '进行中'
                  : `${group.outputs.length} 项产出`}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">{groupExpanded ? '收起' : '展开'}</span>
          </button>

          {groupExpanded && (
            <div className="px-3 pb-3 space-y-2">
              {renderGroupItems(group)}
            </div>
          )}
        </div>
      );
    };

    const renderInlineGroup = (group: AgentOutputGroup, label: string) => (
      <div key={group.key} className="rounded-lg border border-slate-200 bg-white/90 overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <span className="font-medium">{group.agentLabel}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">
              {group.workingStates.length > 0
                ? '进行中'
                : `${group.outputs.length} 项产出`}
            </span>
          </div>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
            {label}
          </span>
        </div>
        <div className="px-3 pb-3 space-y-2">
          {renderGroupItems(group)}
        </div>
      </div>
    );

    const pickFocusGroup = (block?: typeof decisionBlocks[number]) => {
      if (!block) return null;
      const latestGroup = block.groups.find((group) => group.containsLatest);
      if (latestGroup) return latestGroup;
      const workingGroups = block.groups
        .filter((group) => group.workingStates.length > 0)
        .sort((a, b) => b.order - a.order);
      return workingGroups[0] || null;
    };

    const focusGroup = pickFocusGroup(currentBlock);


    return (
      <div className="space-y-3 max-w-[80%]">
        {/* 当前阶段 */}
        {currentBlock && (
          <div className="rounded-lg border border-purple-100 bg-purple-50/20 overflow-hidden">
            <div className="px-3 py-2.5">
              <div className="text-sm font-medium text-purple-700">当前阶段</div>
              <div className="mt-1 text-xs text-purple-600">
                {getDecisionLabel(currentBlock.decision)}
              </div>
              {currentBlock.decision?.reason && (
                <div className="mt-1 text-[11px] text-purple-500 line-clamp-2">
                  {currentBlock.decision.reason}
                </div>
              )}
              {hasUpcomingDecision && latestDecision && (
                <div className="mt-2 text-[11px] text-slate-500">
                  下一步：{getDecisionLabel(latestDecision)}
                </div>
              )}
            </div>

            <div className="px-3 pb-3 space-y-2">
              {currentBlock.groups.length === 0 && (
                <div className="text-[11px] text-slate-400 py-2">暂无产出</div>
              )}
              {currentBlock.groups.map((group) => {
                if (focusGroup && group.key === focusGroup.key) {
                  return renderInlineGroup(group, '当前');
                }
                return renderCollapsibleGroup(group);
              })}
            </div>
          </div>
        )}

        {/* 已完成阶段（折叠） */}
        {historyBlocks.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedHistory((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
            >
              <div className="text-xs font-medium text-slate-700">已完成阶段（{historyBlocks.length}）</div>
              <div className="text-[11px] text-slate-400">{expandedHistory ? '收起' : '展开'}</div>
            </button>

            {expandedHistory && (
              <div className="px-3 pb-3 space-y-3">
                {historyBlocks.map((block) => (
                  <div key={block.key} className="rounded-lg border border-slate-200 bg-white/90 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-medium text-slate-700">
                      阶段：{getDecisionLabel(block.decision)}
                    </div>
                    {block.decision?.reason && (
                      <div className="px-3 pb-2 text-[11px] text-slate-500 line-clamp-2">
                        {block.decision.reason}
                      </div>
                    )}
                    <div className="px-3 pb-3 space-y-2">
                      {block.groups.length === 0 && (
                        <div className="text-[11px] text-slate-400 py-2">暂无产出</div>
                      )}
                      {block.groups.map((group) => renderCollapsibleGroup(group))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 普通文本回复 - 作为最终回退，移除 !isWorkflowComplete 限制以确保历史消息能正常显示 */}
        {!researchContent && msg.content && !parsed && !parsedImagePlan && !(isCurrentlyStreaming && toolEvents.length > 0) && (
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <Markdown content={msg.content} className="text-xs text-gray-700" />
          </div>
        )}
      </div>
    );
  };


  const hasTerminalEventInCurrentStream = !!streamStartedAt && events.some((event) => {
    if (event.timestamp < streamStartedAt) return false;
    return event.type === 'workflow_paused' || event.type === 'workflow_complete';
  });

  const shouldShowProcessingCard = isStreaming
    && messages[messages.length - 1]?.role !== 'assistant'
    && !hasTerminalEventInCurrentStream
    && !askUserDialog.isOpen;


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
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 opacity-20 hover:opacity-100 transition-opacity duration-200">
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
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-3">
                  {/* 用户消息 */}
                  {msg.role === "user" && (
                    <div className="flex justify-end">
                      <HITLResponseMessage message={msg} />
                    </div>
                  )}

                  {/* AI 消息 */}
                  {msg.role === "assistant" && (
                    isHITLRequest(msg) 
                      ? <HITLRequestMessage message={msg} />
                      : renderMessageContent(msg, idx)
                  )}
                </div>
              ))}

              {/* 加载状态 */}
              {shouldShowProcessingCard && (
                <div className="max-w-[80%]">
                  <CollapsibleToolCard
                    title="正在处理"
                    events={events}
                    isLoading={true}
                    expanded={expandedLoading}
                    onToggle={() => setExpandedLoading(!expandedLoading)}
                    phase={streamPhase}
                  />
                </div>
              )}

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
                  placeholder="继续对话…"
                  aria-label="继续对话输入框"
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

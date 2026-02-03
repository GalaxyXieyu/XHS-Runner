"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { Bot, Send, X, Wand2, Paperclip, ChevronDown, Image } from "lucide-react";
import type { AgentEvent, ChatMessage, ImageTask, AskUserDialogState } from "../types";
import type { ContentPackage } from "@/features/material-library/types";
import { NoteDetailModal, type NoteDetailData } from "@/components/NoteDetailModal";
import { Markdown } from "@/components/ui/markdown";
import { processSSEStream, createStreamCallbacks } from "../hooks/useStreamProcessor";

// 子组件
import { createInitialAskUserState } from "./AskUserDialog";
import { CollapsibleToolCard } from "./ToolEventList";
import { ContentCard, parseCreativeContent } from "./ContentCard";
import { ImagePlanCard, parseImagePlanContent } from "./ImagePlanCard";
import { MaterialGallery } from "./MaterialGallery";
import { HITLRequestMessage, HITLResponseMessage, isHITLRequest, InteractiveHITLBubble } from "./HITLMessage";
import { ConversationHistory } from "./ConversationHistory";

// 类型定义
type AspectRatio = "3:4" | "1:1" | "4:3";
type ImageModel = "nanobanana" | "jimeng";
type Mode = "agent" | "custom";
type StyleKey = "cozy" | "minimal" | "illustration" | "ink" | "anime" | "3d" | "cyberpunk" | "photo" | "custom";
type Goal = "collects" | "comments" | "followers";

interface CustomConfig {
  goal: Goal;
  tone: string;
  persona: string;
  extraRequirements: string;
  styleKey: StyleKey;
  customStyleKey: string;
  aspectRatio: AspectRatio;
  count: number;
  model: ImageModel;
}

interface AgentCreatorProps {
  theme: Theme;
  themes?: Theme[];
  onClose?: () => void;
}

const styleOptions: { key: StyleKey; name: string }[] = [
  { key: "cozy", name: "温馨治愈" },
  { key: "minimal", name: "极简风" },
  { key: "illustration", name: "插画风" },
  { key: "ink", name: "水墨风" },
  { key: "anime", name: "动漫风" },
  { key: "3d", name: "3D 渲染" },
  { key: "cyberpunk", name: "赛博朋克" },
  { key: "photo", name: "真实摄影" },
  { key: "custom", name: "自定义" },
];

// Agent 进度权重
const agentProgressMap: Record<string, number> = {
  supervisor: 5,
  research_agent: 20,
  style_analyzer_agent: 30,
  writer_agent: 45,
  image_planner_agent: 55,
  image_agent: 85,
  review_agent: 95,
};

export function AgentCreator({ theme }: AgentCreatorProps) {
  // 基础状态
  const [requirement, setRequirement] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [streamPhase, setStreamPhase] = useState<string>("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  
  // UI 状态
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [mode, setMode] = useState<Mode>("agent");
  const [expandedProcess, setExpandedProcess] = useState(false);
  const [expandedLoading, setExpandedLoading] = useState(true);
  const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);
  const [imageGenProvider, setImageGenProvider] = useState<'gemini' | 'jimeng'>('jimeng');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  
  // 自定义配置
  const [customConfig, setCustomConfig] = useState<CustomConfig>({
    goal: "collects",
    tone: "",
    persona: "",
    extraRequirements: "",
    styleKey: "cozy",
    customStyleKey: "",
    aspectRatio: "3:4",
    count: 4,
    model: "nanobanana",
  });
  
  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  
  // 素材库状态
  const [packages, setPackages] = useState<ContentPackage[]>([]);
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
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}&withAssets=true&limit=12`);
      if (res.ok) {
        const data = await res.json();
        setPackages(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch packages:", error);
    }
  }, [theme.id]);

  // 初始加载素材
  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

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

  // 提交请求
  const handleSubmit = async () => {
    if (!requirement.trim() || isStreaming) return;

    const userMessage = requirement.trim();
    setRequirement("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setEvents([]);
    setImageTasks([]);
    setWorkflowProgress(0);
    setConversationId(null); // 重置对话 ID，新对话会从后端获取
    setIsStreaming(true);
    setStreamPhase("正在规划任务...");

    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage, 
          themeId: theme.id, 
          imageGenProvider, 
          enableHITL: true 
        }),
      });

      await processSSEStream(response, createCallbacks(), { 
        resetEvents: true, 
        source: "handleSubmit" 
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
      setStreamPhase("");
      fetchPackages();
    }
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

    // 重置事件列表，只显示继续后的新步骤
    setEvents([]);

    try {
      setIsStreaming(true);
      setStreamPhase("继续处理中...");

      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Failed to submit response");

      await processSSEStream(res, createCallbacks(), { resetEvents: true, source: "handleAskUserSubmit" });
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

  // 渲染消息内容
  const renderMessageContent = (msg: ChatMessage, idx: number) => {
    const msgEvents = msg.events || [];
    const researchEvents = msgEvents.filter(e => e.agent === "research_agent" && e.type === "message");
    const writerEvents = msgEvents.filter(e => e.agent === "writer_agent" && e.type === "message");
    const imagePlannerEvents = msgEvents.filter(e => e.agent === "image_planner_agent" && e.type === "message");
    const workflowCompleteEvent = msgEvents.find(e => e.type === "workflow_complete") as AgentEvent | undefined;

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

    // 如果有 workflow_complete 事件，使用其中的图片 asset IDs
    const finalImageTasks = workflowCompleteEvent?.imageAssetIds?.length 
      ? workflowCompleteEvent.imageAssetIds.map((assetId: number, i: number) => ({
          id: i + 1,
          prompt: "",
          status: "done" as const,
          assetId,
        }))
      : imageTasks;

    const imagePlannerContent = imagePlannerEvents.map(e => e.content).join("\n");
    const parsedImagePlan = parseImagePlanContent(imagePlannerContent);

    const toolEvents = msgEvents.filter(e => e.type === "tool_call" || e.type === "tool_result");
    const isCurrentlyStreaming = isStreaming && idx === messages.length - 1;
    const isLastAssistantMessage = idx === messages.length - 1 || 
      (idx < messages.length - 1 && messages[idx + 1].role !== 'assistant');
    const isWorkflowComplete = !!workflowCompleteEvent;

    return (
      <div className="space-y-3 max-w-[80%]">
        {/* 研究过程卡片（工作流完成后折叠） */}
        {(researchContent || toolEvents.length > 0 || isCurrentlyStreaming) && isLastAssistantMessage && !isWorkflowComplete && (
          <CollapsibleToolCard
            title="研究过程"
            events={msgEvents}
            isLoading={isCurrentlyStreaming}
            expanded={expandedProcess}
            onToggle={() => setExpandedProcess(!expandedProcess)}
            researchContent={researchContent}
          />
        )}

        {/* 创作内容卡片（最终结果） */}
        {parsed && (
          <ContentCard
            content={parsed}
            imageTasks={finalImageTasks}
            isStreaming={isStreaming && !isWorkflowComplete}
            onImageClick={setPreviewImage}
          />
        )}

        {/* 图片规划卡片（工作流完成后不显示） */}
        {parsedImagePlan && !isWorkflowComplete && (
          <ImagePlanCard imagePlan={parsedImagePlan} />
        )}

        {/* 普通文本回复 */}
        {!researchContent && msg.content && !parsed && !parsedImagePlan && !isWorkflowComplete && (
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <Markdown content={msg.content} className="text-xs text-gray-700" />
          </div>
        )}
      </div>
    );
  };

  // 获取 Agent 颜色
  const getAgentColor = (agent?: string) => {
    const colorMap: Record<string, string> = {
      supervisor: "text-purple-700 bg-purple-50 border border-purple-100",
      research_agent: "text-blue-700 bg-blue-50 border border-blue-100",
      writer_agent: "text-emerald-700 bg-emerald-50 border border-emerald-100",
      image_agent: "text-orange-700 bg-orange-50 border border-orange-100",
    };
    return colorMap[agent || ""] || "text-gray-600 bg-gray-50 border border-gray-100";
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-x-hidden">
      {/* 初始状态布局 */}
      {!hasMessages && (
        <div className="flex-1 overflow-y-auto">
          {/* 上半部分：标题 + 输入框 */}
          <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-gray-800 mb-2">
                开启你的 <span className="text-blue-500">AI 创作</span> 之旅
              </h1>
              <p className="text-sm text-gray-400">
                {mode === "agent" ? "AI 多专家协作，智能创作小红书内容" : "自定义参数，精确控制生成效果"}
              </p>
            </div>

            {/* 输入框区域 */}
            <div className="w-full max-w-3xl mx-auto">
              <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-lg">
                <button
                  type="button"
                  className="w-12 h-12 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <Paperclip className="w-6 h-6" />
                </button>
                <input
                  type="text"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                  placeholder="描述你想创作的内容..."
                  className="flex-1 text-lg text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none"
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming || !requirement.trim()}
                  className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

              {/* 模式切换和选项 */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => { setMode("agent"); setShowCustomForm(false); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border transition-all ${
                    mode === "agent"
                      ? "bg-blue-50 border-blue-200 text-blue-600"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  Agent 模式
                </button>
                <button
                  onClick={() => { setMode("custom"); setShowCustomForm(!showCustomForm); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-full border transition-all ${
                    mode === "custom"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                  自定义
                  {mode === "custom" && <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* 选项区 */}
                <div className="ml-auto flex items-center gap-4">
                  {/* 历史对话 */}
                  <ConversationHistory
                    themeId={theme.id}
                    currentConversationId={conversationId}
                    onSelect={loadConversation}
                    onNewConversation={startNewConversation}
                  />
                  
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConfirm}
                      onChange={(e) => setAutoConfirm(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20"
                    />
                    <span className="text-xs text-gray-500">自动继续</span>
                  </label>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">生图模型:</span>
                    <select
                      value={imageGenProvider}
                      onChange={(e) => setImageGenProvider(e.target.value as 'gemini' | 'jimeng')}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="gemini">Gemini</option>
                      <option value="jimeng">即梦</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 自定义参数面板 */}
              {showCustomForm && (
                <div className="mt-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-gray-700">生成偏好</div>
                    <button onClick={() => setShowCustomForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">内容目标</label>
                      <select
                        value={customConfig.goal}
                        onChange={(e) => setCustomConfig({ ...customConfig, goal: e.target.value as Goal })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="collects">收藏优先</option>
                        <option value="comments">评论优先</option>
                        <option value="followers">涨粉优先</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">图片风格</label>
                      <select
                        value={customConfig.styleKey}
                        onChange={(e) => setCustomConfig({ ...customConfig, styleKey: e.target.value as StyleKey })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        {styleOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">图片比例</label>
                      <select
                        value={customConfig.aspectRatio}
                        onChange={(e) => setCustomConfig({ ...customConfig, aspectRatio: e.target.value as AspectRatio })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="3:4">3:4</option>
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">图像模型</label>
                      <select
                        value={customConfig.model}
                        onChange={(e) => setCustomConfig({ ...customConfig, model: e.target.value as ImageModel })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="nanobanana">Nanobanana</option>
                        <option value="jimeng">即梦</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">目标受众</label>
                      <input
                        type="text"
                        value={customConfig.persona}
                        onChange={(e) => setCustomConfig({ ...customConfig, persona: e.target.value })}
                        placeholder="学生党、职场女性..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">内容语气</label>
                      <input
                        type="text"
                        value={customConfig.tone}
                        onChange={(e) => setCustomConfig({ ...customConfig, tone: e.target.value })}
                        placeholder="干货/亲和、犀利吐槽..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-xs text-gray-400">
              当前主题：<span className="text-gray-500 font-medium">{theme.name}</span>
            </div>
          </div>

          {/* 底部素材库预览 */}
          <MaterialGallery 
            packages={packages} 
            onSelect={setSelectedPackage} 
          />
        </div>
      )}

      {/* 有消息时的布局 */}
      {hasMessages && (
        <>
          {/* 进度条（streaming 时显示） */}
          {isStreaming && workflowProgress > 0 && (
            <div className="h-1 bg-gray-100">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${workflowProgress}%` }}
              />
            </div>
          )}

          {/* 消息区域 */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
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
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
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

            {/* 事件面板 */}
            {showEvents && (
              <div className="w-80 border-l border-gray-100 bg-gray-50 flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-medium text-gray-800">执行过程</h3>
                  <p className="text-xs text-gray-500">实时查看各专家状态</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {events.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">等待执行...</div>
                  )}
                  {events.map((event, idx) => (
                    <div key={idx} className={`p-2.5 rounded-xl text-xs ${getAgentColor(event.agent)}`}>
                      <div className="flex items-center gap-2">
                        {event.agent && <span className="font-medium">{event.agent}</span>}
                      </div>
                      <div className="mt-1 text-gray-600 line-clamp-2">{event.content}</div>
                    </div>
                  ))}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* 底部输入框 */}
          <div className="bg-white border-t border-gray-100 px-4 py-3">
            <div className="max-w-3xl mx-auto">
              {/* 工具栏 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {/* 历史对话 */}
                  <ConversationHistory
                    themeId={theme.id}
                    currentConversationId={conversationId}
                    onSelect={loadConversation}
                    onNewConversation={startNewConversation}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {/* 查看过程 */}
                  <button
                    onClick={() => setShowEvents(!showEvents)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      showEvents ? "bg-orange-50 text-orange-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {showEvents ? "隐藏过程" : "查看过程"}
                  </button>
                </div>
              </div>
              {/* 输入框 */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                <input
                  type="text"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                  placeholder="继续对话..."
                  className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none"
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming || !requirement.trim()}
                  className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 transition-colors"
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

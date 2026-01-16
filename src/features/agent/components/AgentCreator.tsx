"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { Bot, Send, X, Wand2, Paperclip, ChevronDown, ChevronRight, ChevronLeft, Image, RefreshCw, Download, Copy, MoreHorizontal } from "lucide-react";
import type { AgentEvent, ChatMessage, ImageTask } from "../types";
import type { ContentPackage } from "@/features/material-library/types";
import { NoteDetailModal, type NoteDetailData } from "@/components/NoteDetailModal";

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

// 解析创作内容
interface ParsedContent {
  title: string;
  body: string;
  tags: string[];
}

function parseCreativeContent(content: string): ParsedContent | null {
  // 检测是否是创作内容（包含标题和标签标记）
  if (!content.includes("标题") || !content.includes("标签")) return null;

  // 提取标题
  const titleMatch = content.match(/(?:📌\s*)?标题[：:]\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || "";

  // 提取标签
  const tagMatch = content.match(/(?:🏷️\s*)?标签[：:]\s*(.+?)(?:\n|$)/);
  const tagsStr = tagMatch?.[1] || "";
  const tags = tagsStr.match(/#[\w\u4e00-\u9fa5]+/g)?.map(t => t.slice(1)) || [];

  // 提取正文
  let body = content;
  const titleIndex = content.indexOf(titleMatch?.[0] || "");
  const tagIndex = content.indexOf(tagMatch?.[0] || "");

  if (titleMatch && tagMatch) {
    const startIdx = titleIndex + (titleMatch[0]?.length || 0);
    body = content.slice(startIdx, tagIndex).trim();
  }

  if (!title) return null;
  return { title, body, tags };
}

export function AgentCreator({ theme }: AgentCreatorProps) {
  const [requirement, setRequirement] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [streamPhase, setStreamPhase] = useState<string>("");  // 当前阶段提示
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [mode, setMode] = useState<Mode>("agent");
  const [expandedProcess, setExpandedProcess] = useState(false);  // 过程消息展开状态（默认折叠）
  const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);  // 图片生成任务
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ContentPackage | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
    // TODO: 保存到后端
    console.log("保存数据:", data);
    // 更新本地状态
    setPackages(prev => prev.map(pkg =>
      pkg.id === selectedPackage.id
        ? { ...pkg, titles: [data.title], selectedTitleIndex: 0, content: data.desc, tags: data.tags || [], images: data.images }
        : pkg
    ));
  }, [selectedPackage]);

  const hasMessages = messages.length > 0 || isStreaming;

  // 获取素材库数据
  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}&withAssets=true&limit=12`);
      if (res.ok) {
        const data = await res.json();
        // 转换 API 返回格式为 ContentPackage
        const mapped: ContentPackage[] = (Array.isArray(data) ? data : []).map((item: { creative: { id: number; title?: string; content?: string; tags?: string; status?: string; createdAt?: string }; assets?: { id: number }[] }) => {
          const allImages = (item.assets || []).map(a => `/api/assets/${a.id}`);
          return {
            id: String(item.creative.id),
            titles: item.creative.title ? [item.creative.title] : ["未命名"],
            selectedTitleIndex: 0,
            content: item.creative.content || "",
            tags: item.creative.tags?.split(",").filter(Boolean) || [],
            coverImage: allImages[0],
            images: allImages,
            qualityScore: 0,
            predictedMetrics: { likes: 0, collects: 0, comments: 0 },
            rationale: "",
            status: (item.creative.status as "draft" | "published" | "archived") || "draft",
            createdAt: item.creative.createdAt || new Date().toISOString(),
            source: "agent",
            sourceName: "Agent 生成",
          };
        });
        setPackages(mapped);
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

  // 轮询图片任务状态
  useEffect(() => {
    const pendingTasks = imageTasks.filter(t => t.id > 0 && (t.status === "queued" || t.status === "generating"));
    if (pendingTasks.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const task of pendingTasks) {
        try {
          const res = await fetch(`/api/tasks/${task.id}`);
          if (res.ok) {
            const data = await res.json();
            setImageTasks(prev => prev.map(t =>
              t.id === task.id ? { ...t, status: data.status, assetId: data.assetId, errorMessage: data.errorMessage } : t
            ));
          }
        } catch {}
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [imageTasks]);

  const handleSubmit = async () => {
    if (!requirement.trim() || isStreaming) return;

    const userMessage = requirement.trim();
    setRequirement("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setEvents([]);
    setImageTasks([]);  // 重置图片任务
    setIsStreaming(true);
    setStreamPhase("正在规划任务...");

    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, themeId: theme.id }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const collectedEvents: AgentEvent[] = [];

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: AgentEvent = JSON.parse(data);
              collectedEvents.push(event);
              setEvents([...collectedEvents]);
              updatePhase(event);  // 更新阶段提示

              // 收集批量图片生成任务
              if (event.type === "tool_result" && event.tool === "generate_images" && event.taskIds && event.prompts) {
                // 一次性添加所有任务
                const newTasks: ImageTask[] = event.taskIds.map((id, i) => ({
                  id,
                  prompt: event.prompts![i] || "",
                  status: "queued" as const,
                }));
                setImageTasks(prev => [...prev, ...newTasks]);
              }

              if (event.type === "message" && event.content) {
                assistantContent += (assistantContent ? "\n\n" : "") + event.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMsg = newMessages[newMessages.length - 1];
                  if (lastMsg?.role === "assistant") {
                    lastMsg.content = assistantContent;
                    lastMsg.events = [...collectedEvents];
                  } else {
                    newMessages.push({
                      role: "assistant",
                      content: assistantContent,
                      events: [...collectedEvents],
                    });
                  }
                  return newMessages;
                });
              }
            } catch { }
          }
        }
      }
    } catch (error) {
      console.error("Stream error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ 连接错误，请重试" },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamPhase("");  // 清除阶段提示
      // 生成完成后刷新素材库
      fetchPackages();
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "agent_start": return "🤖";
      case "agent_end": return "✅";
      case "tool_call": return "🔧";
      case "tool_result": return "📊";
      case "message": return "💬";
      default: return "•";
    }
  };

  const getAgentColor = (agent?: string) => {
    switch (agent) {
      case "supervisor": return "text-purple-700 bg-purple-50 border border-purple-100";
      case "research_agent": return "text-blue-700 bg-blue-50 border border-blue-100";
      case "writer_agent": return "text-emerald-700 bg-emerald-50 border border-emerald-100";
      case "image_agent": return "text-orange-700 bg-orange-50 border border-orange-100";
      default: return "text-gray-600 bg-gray-50 border border-gray-100";
    }
  };

  // 根据事件更新阶段提示
  const updatePhase = (event: AgentEvent) => {
    if (event.type === "agent_start") {
      switch (event.agent) {
        case "research_agent": setStreamPhase("正在检索相关内容..."); break;
        case "writer_agent": setStreamPhase("正在创作文案..."); break;
        case "image_agent": setStreamPhase("正在生成图片..."); break;
        case "supervisor": setStreamPhase("正在规划任务..."); break;
      }
    } else if (event.type === "tool_call") {
      if (event.tool === "search_notes") setStreamPhase("搜索相关笔记...");
      else if (event.tool === "analyze_tags") setStreamPhase("分析热门标签...");
      else if (event.tool === "get_top_titles") setStreamPhase("获取爆款标题...");
      else if (event.tool === "generate_images") setStreamPhase("批量生成封面图...");
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-x-hidden">
      {/* 初始状态布局 */}
      {!hasMessages && (
        <div className="flex-1 overflow-y-auto">
          {/* 上半部分：标题 + 输入框 */}
          <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
            {/* 标题 */}
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
                  aria-label="上传文件"
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
                  aria-label="发送"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

              {/* 模式切换按钮 */}
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

            {/* 当前主题 */}
            <div className="mt-6 text-xs text-gray-400">
              当前主题：<span className="text-gray-500 font-medium">{theme.name}</span>
            </div>
          </div>

          {/* 底部素材库 - 预览区 */}
          <div className="bg-gray-50/50 relative">
            {/* 顶部渐变过渡 */}
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Image className="w-4 h-4" />
                  <span>灵感素材</span>
                  {packages.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">{packages.length}</span>
                  )}
                </div>
                <button className="text-xs text-blue-500 hover:text-blue-600 font-medium">查看更多 →</button>
              </div>
              {/* 素材网格 - 真实数据或空状态 */}
              <div className="grid grid-cols-4 gap-4">
                {packages.length > 0 ? (
                  packages.slice(0, 12).map((pkg) => (
                    <div
                      key={pkg.id}
                      className="group cursor-pointer"
                      onClick={() => setSelectedPackage(pkg)}
                    >
                      <div className="aspect-[3/4] rounded-2xl bg-gray-100 mb-2 overflow-hidden relative shadow-sm group-hover:shadow-lg group-hover:scale-[1.02] transition-all">
                        {pkg.coverImage ? (
                          <img
                            src={pkg.coverImage}
                            alt={pkg.titles?.[pkg.selectedTitleIndex] || "素材"}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                            <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                              <Image className="w-7 h-7 text-white/80" />
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 text-center font-medium line-clamp-1">
                        {pkg.titles?.[pkg.selectedTitleIndex] || "未命名"}
                      </p>
                      {pkg.tags && pkg.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 justify-center">
                          {pkg.tags.slice(0, 2).map((tag, idx) => (
                            <span key={idx} className="text-xs text-gray-400">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  // 空状态 - 显示引导
                  <div className="col-span-4 py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Image className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-500 mb-2">还没有创作内容</p>
                    <p className="text-xs text-gray-400">在上方输入框描述你想创作的内容，AI 将为你生成</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 有消息时：结果流 + 底部输入框 */}
      {hasMessages && (
        <>
          {/* 顶部工具栏 - 简洁风格 */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{mode === "agent" ? "Agent 模式" : "自定义模式"}</span>
              <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">{theme.name}</span>
            </div>
            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${showEvents ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {showEvents ? "隐藏过程" : "查看过程"}
            </button>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 flex overflow-hidden">
            <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-4 ${showEvents ? "mr-0" : ""}`}>
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-3">
                  {/* 用户消息 - 简洁灰色风格 */}
                  {msg.role === "user" && (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-xl px-4 py-2.5 bg-gray-100 text-gray-800">
                        <div className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  )}

                  {/* AI 消息 - 卡片风格 */}
                  {msg.role === "assistant" && (() => {
                    // 从 events 中分离不同类型的内容
                    const msgEvents = msg.events || [];
                    const researchEvents = msgEvents.filter(e => e.agent === "research_agent" && e.type === "message");
                    const writerEvents = msgEvents.filter(e => e.agent === "writer_agent" && e.type === "message");

                    // 去重研究内容（取最后一条完整内容）
                    const researchContent = researchEvents.length > 0
                      ? researchEvents[researchEvents.length - 1]?.content || ""
                      : "";

                    // 解析创作内容
                    const writerContent = writerEvents.map(e => e.content).join("\n");
                    const parsed = parseCreativeContent(writerContent);

                    // 从 events 中提取各阶段的工具调用和结果
                    const toolEvents = msgEvents.filter(e => e.type === "tool_call" || e.type === "tool_result");
                    const isCurrentlyStreaming = isStreaming && idx === messages.length - 1;

                    return (
                      <div className="space-y-3">
                        {/* 研究过程 - 包含状态和结果 */}
                        {(researchContent || toolEvents.length > 0 || isCurrentlyStreaming) && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setExpandedProcess(!expandedProcess)}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50/50 hover:bg-blue-50 transition-colors text-left"
                            >
                              {isCurrentlyStreaming ? (
                                <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                              ) : (
                                <ChevronRight className={`w-3.5 h-3.5 text-blue-500 transition-transform ${expandedProcess ? "rotate-90" : ""}`} />
                              )}
                              <span className="text-xs font-medium text-blue-700">研究过程</span>
                              {isCurrentlyStreaming && streamPhase && (
                                <span className="text-xs text-blue-500 ml-1">· {streamPhase}</span>
                              )}
                            </button>
                            {expandedProcess && (
                              <div className="bg-white border-t border-gray-100 max-h-60 overflow-y-auto">
                                {/* 工具调用步骤 */}
                                <div className="divide-y divide-gray-50">
                                  {toolEvents.map((event, i) => {
                                    // 工具/Agent 名称中文映射
                                    const nameMap: Record<string, string> = {
                                      search_notes: "搜索笔记",
                                      analyze_notes: "分析笔记",
                                      generate_content: "生成内容",
                                      research_agent: "研究助手",
                                      writer_agent: "写作助手",
                                      image_agent: "图片助手",
                                      supervisor: "任务调度",
                                    };
                                    const rawName = event.tool || event.agent || "";
                                    const displayName = nameMap[rawName] || rawName;
                                    const isCall = event.type === "tool_call";

                                    return (
                                      <div key={i} className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs px-1.5 py-0.5 rounded ${isCall ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"}`}>
                                            {isCall ? "调用" : "结果"}
                                          </span>
                                          <span className="text-xs font-medium text-gray-700">
                                            {displayName}
                                          </span>
                                          {!isCall && (
                                            <span className="text-xs text-green-600">完成</span>
                                          )}
                                        </div>
                                        {event.content && (
                                          <div className="mt-1 text-xs text-gray-500 line-clamp-2">{event.content}</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* 研究内容总结 */}
                                {researchContent && (
                                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                                    <div className="text-xs text-gray-400 mb-1">研究总结</div>
                                    <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{researchContent}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 创作内容 - 紧凑卡片 */}
                        {parsed ? (
                          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            {/* 标题区 */}
                            <div className="px-4 pt-4 pb-2">
                              <h3 className="text-base font-semibold text-gray-900 leading-tight">{parsed.title}</h3>
                            </div>

                            {/* 正文区 */}
                            <div className="px-4 py-2">
                              <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">{parsed.body}</div>
                            </div>

                            {/* 标签区 */}
                            {parsed.tags.length > 0 && (
                              <div className="px-4 pb-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {parsed.tags.map((tag, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 图片区 - 横向滚动 */}
                            {imageTasks.length > 0 && (
                              <div className="px-4 pb-4 pt-1">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-gray-400">封面图</span>
                                  <span className="text-xs text-gray-400">{imageTasks.filter(t => t.status === "done").length}/{imageTasks.length}</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {imageTasks.map((task, i) => (
                                    <div key={task.id || i} className="flex-shrink-0 w-24">
                                      <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
                                        {task.status === "done" && task.assetId ? (
                                          <img
                                            src={`/api/assets/${task.assetId}`}
                                            alt={`生成图片 ${i + 1}`}
                                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => setPreviewImage(`/api/assets/${task.assetId}`)}
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
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : !researchContent && msg.content ? (
                          /* 普通文本回复（仅当没有研究内容时显示） */
                          <div className="bg-gray-50 rounded-xl px-4 py-3">
                            <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        ) : null}

                        {/* 操作按钮 */}
                        {!isStreaming && parsed && (
                          <div className="flex items-center gap-1.5">
                            <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                              <RefreshCw className="w-3 h-3" />
                              重新生成
                            </button>
                            <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                              <Copy className="w-3 h-3" />
                              复制
                            </button>
                            <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                              <Download className="w-3 h-3" />
                              下载
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}

              {/* 加载状态 - 轻量进度提示 */}
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/80 rounded-lg">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  <span className="text-xs text-gray-500">{streamPhase || "AI 正在创作中..."}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Events Panel */}
            {showEvents && (
              <div className="w-80 border-l border-gray-100 bg-gray-50 flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-medium text-gray-800">执行过程</h3>
                  <p className="text-xs text-gray-500">实时查看各专家状态</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {events.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">
                      等待执行...
                    </div>
                  )}
                  {events.map((event, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs ${getAgentColor(event.agent)}`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{getEventIcon(event.type)}</span>
                        {event.agent && (
                          <span className="font-medium">{event.agent}</span>
                        )}
                      </div>
                      <div className="mt-1 text-gray-600 line-clamp-2">{event.content}</div>
                    </div>
                  ))}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* 底部输入框 - 紧凑版 */}
          <div className="bg-white px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
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

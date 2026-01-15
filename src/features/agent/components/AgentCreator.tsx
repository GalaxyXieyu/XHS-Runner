"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Theme } from "@/App";
import { Bot, Send, X, Wand2, Paperclip, ChevronDown, Image, RefreshCw, Download, Copy, MoreHorizontal } from "lucide-react";
import type { AgentEvent, ChatMessage } from "../types";
import type { ContentPackage } from "@/features/material-library/types";

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

export function AgentCreator({ theme }: AgentCreatorProps) {
  const [requirement, setRequirement] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [streamPhase, setStreamPhase] = useState<string>("");  // 当前阶段提示
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [mode, setMode] = useState<Mode>("agent");
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

  const hasMessages = messages.length > 0 || isStreaming;

  // 获取素材库数据
  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}&withAssets=true&limit=12`);
      if (res.ok) {
        const data = await res.json();
        // 转换 API 返回格式为 ContentPackage
        const mapped: ContentPackage[] = (Array.isArray(data) ? data : []).map((item: { creative: { id: number; title?: string; content?: string; tags?: string; status?: string; createdAt?: string }; assets?: { id: number }[] }) => ({
          id: String(item.creative.id),
          titles: item.creative.title ? [item.creative.title] : ["未命名"],
          selectedTitleIndex: 0,
          content: item.creative.content || "",
          tags: item.creative.tags?.split(",").filter(Boolean) || [],
          coverImage: item.assets?.[0]?.id ? `/api/assets/${item.assets[0].id}` : undefined,
          qualityScore: 0,
          predictedMetrics: { likes: 0, collects: 0, comments: 0 },
          rationale: "",
          status: (item.creative.status as "draft" | "published" | "archived") || "draft",
          createdAt: item.creative.createdAt || new Date().toISOString(),
          source: "agent",
          sourceName: "Agent 生成",
        }));
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

  const handleSubmit = async () => {
    if (!requirement.trim() || isStreaming) return;

    const userMessage = requirement.trim();
    setRequirement("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setEvents([]);
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
      else if (event.tool === "generate_image") setStreamPhase("生成封面图...");
    }
  };

  // 输入框组件
  const InputBox = ({ centered = false }: { centered?: boolean }) => (
    <div className={`${centered ? "w-full max-w-3xl mx-auto" : ""}`}>
      {/* 输入框主体 */}
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

      {/* 自定义参数面板（展开式，不是弹窗） */}
      {showCustomForm && (
        <div className="mt-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">生成偏好</div>
            <button onClick={() => setShowCustomForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 内容目标 */}
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
            {/* 图片风格 */}
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
            {/* 图片比例 */}
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
            {/* 图像模型 */}
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

          {/* 更多选项 */}
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
  );

  return (
    <div className="h-full flex flex-col bg-white">
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
            <InputBox centered />

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
                    <div key={pkg.id} className="group cursor-pointer">
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
                      <p className="text-sm text-gray-600 text-center font-medium line-clamp-2">
                        {pkg.titles?.[pkg.selectedTitleIndex] || "未命名"}
                      </p>
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
            <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-6 ${showEvents ? "mr-0" : ""}`}>
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-4">
                  {/* 用户消息 - 橙色背景风格 */}
                  {msg.role === "user" && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-gradient-to-r from-orange-400 to-amber-400 text-white shadow-sm">
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  )}

                  {/* AI 消息 - 卡片风格 */}
                  {msg.role === "assistant" && (
                    <div className="space-y-4">
                      {/* 流式进度提示 - 只在当前消息正在生成时显示 */}
                      {isStreaming && idx === messages.length - 1 && streamPhase && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 rounded-xl">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          <span className="text-sm text-gray-500">{streamPhase}</span>
                        </div>
                      )}

                      {/* AI 文字回复 */}
                      {msg.content && (
                        <div className="bg-gray-50 rounded-2xl px-5 py-4">
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      )}

                      {/* 操作按钮 - 只在完成后显示 */}
                      {!isStreaming && (
                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all">
                            <RefreshCw className="w-4 h-4" />
                            重新生成
                          </button>
                          <button className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all">
                            <Copy className="w-4 h-4" />
                            复制文案
                          </button>
                          <button className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all">
                            <Download className="w-4 h-4" />
                            下载图片
                          </button>
                          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* 加载状态 - 轻量进度提示 */}
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 rounded-xl">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">{streamPhase || "AI 正在创作中..."}</span>
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
    </div>
  );
}

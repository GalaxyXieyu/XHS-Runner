"use client";

import { useState, useRef, useEffect } from "react";
import type { Theme } from "@/App";
import { Bot, Send, User, X, Wand2, Paperclip, ChevronDown, Image } from "lucide-react";
import type { AgentEvent, ChatMessage } from "../types";

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

  const hasMessages = messages.length > 0 || isStreaming;

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
          {mode === "agent" && <ChevronDown className="w-3.5 h-3.5" />}
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
                </div>
                <button className="text-xs text-blue-500 hover:text-blue-600 font-medium">查看更多 →</button>
              </div>
              {/* 素材网格 - 一行4个 */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { color: "from-rose-200 to-pink-300", label: "美妆护肤" },
                  { color: "from-amber-200 to-orange-300", label: "美食探店" },
                  { color: "from-emerald-200 to-teal-300", label: "穿搭分享" },
                  { color: "from-blue-200 to-indigo-300", label: "旅行攻略" },
                  { color: "from-purple-200 to-violet-300", label: "家居好物" },
                  { color: "from-cyan-200 to-sky-300", label: "数码科技" },
                  { color: "from-pink-200 to-rose-300", label: "宠物日常" },
                  { color: "from-lime-200 to-green-300", label: "健身运动" },
                  { color: "from-orange-200 to-red-300", label: "职场干货" },
                  { color: "from-indigo-200 to-purple-300", label: "学习笔记" },
                  { color: "from-teal-200 to-cyan-300", label: "摄影技巧" },
                  { color: "from-yellow-200 to-amber-300", label: "手工DIY" },
                ].map((item, i) => (
                  <div key={i} className="group cursor-pointer">
                    <div className={`aspect-[3/4] rounded-2xl bg-gradient-to-br ${item.color} mb-2 overflow-hidden relative shadow-sm group-hover:shadow-lg group-hover:scale-[1.02] transition-all`}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                          <Image className="w-7 h-7 text-white/80" />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 text-center font-medium">{item.label}</p>
                  </div>
                ))}
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Bot className="w-4 h-4" />
                <span>{mode === "agent" ? "Agent 模式" : "自定义模式"}</span>
              </div>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{theme.name}</span>
            </div>
            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${showEvents ? "bg-gray-100 text-gray-700" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {showEvents ? "隐藏过程" : "显示过程"}
            </button>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 flex overflow-hidden">
            <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-5 ${showEvents ? "mr-0" : ""}`}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role !== "user" && (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 text-gray-800 shadow-sm"
                      }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center animate-pulse">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
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

          {/* 底部输入框 */}
          <div className="border-t border-gray-100 bg-white p-4">
            <div className="max-w-3xl mx-auto">
              <InputBox />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

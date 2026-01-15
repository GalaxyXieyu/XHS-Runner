"use client";

import { useState, useRef, useEffect } from "react";
import type { Theme } from "@/App";
import { Bot, Sparkles, Send, User } from "lucide-react";
import type { AgentEvent, ChatMessage } from "../types";

interface AgentCreatorProps {
  theme: Theme;
  themes?: Theme[];
  onClose?: () => void;
}

export function AgentCreator({ theme, onClose }: AgentCreatorProps) {
  const [requirement, setRequirement] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-sm text-gray-700">
            <Bot className="w-4 h-4 text-emerald-500" />
            Agent 模式
          </div>
          <div className="text-xs text-gray-500">主题：{theme.name}</div>
        </div>
        <button
          onClick={() => setShowEvents(!showEvents)}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${showEvents ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-white text-gray-600 border-gray-200"
            }`}
        >
          {showEvents ? "隐藏过程" : "显示过程"}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden px-6 pb-6">
        <div className={`flex-1 flex flex-col rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden ${showEvents ? "mr-4" : ""}`}>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="max-w-md w-full rounded-3xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-gray-100">
                    <Sparkles className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">多 Agent 协作生成</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    由研究、创作、图片等角色协同工作，输出更完整的内容方案。
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4 text-xs text-gray-600">
                    <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-full">研究专家</span>
                    <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-full">创作专家</span>
                    <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-full">图片专家</span>
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role !== "user" && (
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Bot className="w-4 h-4 text-emerald-500" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                    ? "bg-gray-900 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                    }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center animate-pulse">
                  <Bot className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
              <input
                type="text"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                placeholder="描述你想创作的内容，例如：写一篇关于春季穿搭的种草笔记..."
                className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none"
                disabled={isStreaming}
              />
              <button
                onClick={handleSubmit}
                disabled={isStreaming || !requirement.trim()}
                className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40"
                aria-label="发送"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Events Panel */}
        {showEvents && (
          <div className="w-72 flex flex-col rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
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
                  className={`p-2 rounded-xl text-xs ${getAgentColor(event.agent)}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{getEventIcon(event.type)}</span>
                    {event.agent && (
                      <span className="font-medium">{event.agent}</span>
                    )}
                  </div>
                  <div className="mt-1 text-gray-600 truncate">{event.content}</div>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

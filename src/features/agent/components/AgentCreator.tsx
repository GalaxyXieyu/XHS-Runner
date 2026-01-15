"use client";

import { useState, useRef, useEffect } from "react";
import type { Theme } from "@/App";
import { Bot, Sparkles, X, Send, User } from "lucide-react";
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
      case "supervisor": return "text-purple-600 bg-purple-50";
      case "research_agent": return "text-blue-600 bg-blue-50";
      case "writer_agent": return "text-green-600 bg-green-50";
      case "image_agent": return "text-orange-600 bg-orange-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-pink-50 to-orange-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Multi-Agent 创作助手</h2>
            <p className="text-sm text-gray-500">主题: {theme.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${showEvents ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              }`}
          >
            {showEvents ? "隐藏过程" : "显示过程"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${showEvents ? "border-r" : ""}`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles className="w-12 h-12 text-pink-500 mb-4" />
                <h3 className="text-xl font-semibold text-gray-800">Multi-Agent 创作系统</h3>
                <p className="text-gray-500 mt-2 max-w-md">
                  由研究专家、创作专家、图片专家协同工作，为你创作高质量小红书内容
                </p>
                <div className="flex gap-2 mt-4">
                  <span className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded">🔍 研究专家</span>
                  <span className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded">✍️ 创作专家</span>
                  <span className="px-2 py-1 text-xs bg-orange-50 text-orange-600 rounded">🎨 图片专家</span>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role !== "user" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800"
                    }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 flex items-center justify-center animate-pulse">
                  <Bot className="w-4 h-4 text-white" />
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

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
                placeholder="描述你想创作的内容，例如：写一篇关于春季穿搭的种草笔记..."
                className="flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                disabled={isStreaming}
              />
              <button
                onClick={handleSubmit}
                disabled={isStreaming || !requirement.trim()}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                发送
              </button>
            </div>
          </div>
        </div>

        {/* Events Panel */}
        {showEvents && (
          <div className="w-80 flex flex-col bg-gray-50">
            <div className="px-4 py-3 border-b bg-white">
              <h3 className="font-medium text-gray-800">Agent 执行过程</h3>
              <p className="text-xs text-gray-500">实时查看各专家的工作状态</p>
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
                  className={`p-2 rounded-lg text-xs ${getAgentColor(event.agent)}`}
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

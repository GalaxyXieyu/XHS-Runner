/**
 * 历史对话下拉菜单组件
 * 显示当前主题下的历史对话，支持加载和删除
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { History, Trash2, Plus, ChevronDown, Check } from "lucide-react";

interface Conversation {
  id: number;
  threadId: string;
  title: string | null;
  status: string;
  creativeId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationHistoryProps {
  themeId: number | string;
  currentConversationId: number | null;
  onSelect: (id: number) => void;
  onNewConversation: () => void;
  /** 紧凑模式 - 只显示图标 */
  compact?: boolean;
}

export function ConversationHistory({
  themeId,
  currentConversationId,
  onSelect,
  onNewConversation,
  compact = false,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/conversations?themeId=${themeId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [themeId]);

  // 打开时加载
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, loadConversations]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 删除对话
  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这条对话记录吗？")) return;

    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === currentConversationId) {
          onNewConversation();
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  // 选择对话
  const handleSelect = (id: number) => {
    onSelect(id);
    setIsOpen(false);
  };

  // 新建对话
  const handleNew = () => {
    onNewConversation();
    setIsOpen(false);
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "昨天";
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={compact
          ? `p-2 rounded-xl transition-all ${
              isOpen 
                ? "bg-blue-100 text-blue-600" 
                : "bg-white/90 backdrop-blur text-gray-500 hover:text-gray-700 hover:bg-gray-100 shadow-md shadow-gray-200/50 ring-1 ring-gray-100"
            }`
          : `flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
              isOpen ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-50"
            }`
        }
        title="历史对话"
      >
        <History className={compact ? "w-4 h-4" : "w-3.5 h-3.5"} />
        {!compact && (
          <>
            <span>历史</span>
            {conversations.length > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs min-w-[18px] text-center">
                {conversations.length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
          {/* 新建按钮 */}
          <div className="p-2 border-b border-gray-100">
            <button
              onClick={handleNew}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建对话</span>
            </button>
          </div>

          {/* 对话列表 */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="text-center text-gray-400 text-sm py-6">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-6">暂无历史对话</div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      conv.id === currentConversationId
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {/* 选中标记 */}
                    <div className="w-4 h-4 flex-shrink-0">
                      {conv.id === currentConversationId && (
                        <Check className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    
                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        conv.id === currentConversationId ? "text-blue-700 font-medium" : "text-gray-700"
                      }`}>
                        {conv.title || "未命名对话"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{formatTime(conv.updatedAt)}</span>
                        {conv.status === "active" && (
                          <span className="px-1 py-0.5 text-[10px] bg-yellow-100 text-yellow-600 rounded">进行中</span>
                        )}
                      </div>
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Brain, Sparkles } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * 解析内容，分离 <think> 标签内的思考过程和最终回答
 */
function parseContent(content: string): { thinking: string; answer: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);

  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return { thinking, answer };
  }

  // 处理未闭合的 <think> 标签（流式输出中）
  const openThinkMatch = content.match(/<think>([\s\S]*?)$/);
  if (openThinkMatch) {
    return { thinking: openThinkMatch[1].trim(), answer: '' };
  }

  return { thinking: '', answer: content };
}

export function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { thinking, answer } = useMemo(() => parseContent(content), [content]);

  // 如果正在流式输出且有思考内容，自动展开
  const showExpanded = isStreaming && thinking && !answer ? true : isExpanded;

  if (!thinking && !answer) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* 思考过程区块 */}
      {thinking && (
        <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 overflow-hidden">
          {/* 折叠头部 */}
          <button
            onClick={() => setIsExpanded(!showExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-100/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-purple-600">
              <Brain className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">思考过程</span>
            </div>

            {isStreaming && !answer && (
              <div className="flex items-center gap-1 text-purple-500">
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-purple-400">思考中</span>
              </div>
            )}

            <div className="ml-auto text-purple-400">
              {showExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>

          {/* 思考内容 */}
          {showExpanded && (
            <div className="px-3 pb-3 border-t border-purple-100">
              <div className="mt-2 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                {thinking}
                {isStreaming && !answer && (
                  <span className="inline-block w-1.5 h-3.5 bg-purple-400 ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 最终回答 */}
      {answer && (
        <div className="rounded-lg bg-white border border-gray-200 p-3">
          <div className="flex items-center gap-1.5 text-emerald-600 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">分析结果</span>
          </div>
          <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {answer}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/components/ui/utils';

interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  step?: number;
  intervalMs?: number;
  onCitationClick?: (index: number) => void;
}

const DEFAULT_STEP = 6;
const DEFAULT_INTERVAL = 24;

export function StreamingMarkdown({
  content,
  isStreaming = false,
  className,
  step = DEFAULT_STEP,
  intervalMs = DEFAULT_INTERVAL,
}: StreamingMarkdownProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const previousContentRef = useRef('');
  const timerRef = useRef<number | null>(null);

  // 当 content 或 streaming 状态变化时，重置可见计数（避免在 render 阶段 setState）
  useEffect(() => {
    const previousContent = previousContentRef.current;
    if (!isStreaming || !content.startsWith(previousContent)) {
      setVisibleCount(!isStreaming ? content.length : 0);
    }
    previousContentRef.current = content;
  }, [content, isStreaming]);

  // 使用 ref 存储最新的 content 和 step，避免闭包问题
  const latestStateRef = useRef({ content, step, isStreaming });
  latestStateRef.current = { content, step, isStreaming };

  useEffect(() => {
    if (!isStreaming) {
      setVisibleCount(content.length);
      return;
    }

    // 清除之前的定时器
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }

    timerRef.current = window.setInterval(() => {
      const { content: currentContent, step: currentStep } = latestStateRef.current;
      setVisibleCount((prev) => {
        if (prev >= currentContent.length) {
          // 完成后清除定时器
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return prev;
        }
        return Math.min(currentContent.length, prev + currentStep);
      });
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, intervalMs]); // 只依赖 isStreaming 和 intervalMs，content 和 step 通过 ref 获取

  const visibleContent = !isStreaming ? content : content.slice(0, Math.max(0, visibleCount));

  return (
    <Markdown
      content={visibleContent}
      className={cn('text-xs text-gray-600 leading-relaxed whitespace-pre-wrap', className)}
    />
  );
}

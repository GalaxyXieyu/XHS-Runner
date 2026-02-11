import type { AgentEvent, ChatMessage, ImageTask } from '../../types';
import { Markdown } from '@/components/ui/markdown';
import { buildAgentTimeline } from '../../utils/buildAgentTimeline';
import { AgentTimelineView } from './AgentTimelineView';
import {
  HITLResponseMessage,
  isHITLRequest,
  extractHITLContent,
  CollapsedContentCard,
} from '../HITLMessage';
import { Check, MessageSquare } from 'lucide-react';

interface MessageTypeRendererProps {
  message: ChatMessage;
  index: number;
  total: number;
  hasLaterAssistant?: boolean;
  isStreaming: boolean;
  liveEvents: AgentEvent[];
  imageTasks: ImageTask[];
  streamPhase: string;
  onImageClick?: (imageUrl: string) => void;
  nextMessageRole?: ChatMessage['role'];
}

export function MessageTypeRenderer({
  message,
  index,
  total,
  hasLaterAssistant = false,
  isStreaming,
  liveEvents,
  imageTasks,
  streamPhase,
  onImageClick,
  nextMessageRole,
}: MessageTypeRendererProps) {
  // ── 用户消息 ──
  if (message.role === 'user') {
    const { askUserResponse } = message;
    const contentData = askUserResponse?.context
      ? extractHITLContent(askUserResponse.context)
      : null;

    // 有 HITL 内容（文案/图片规划）→ 左边内容卡 + 右边确认胶囊
    if (contentData) {
      const labels = askUserResponse!.selectedLabels;
      const customInput = askUserResponse!.customInput;
      return (
        <div className="space-y-2.5">
          {/* 左对齐：系统产出的内容 */}
          <div className="max-w-[85%]">
            <CollapsedContentCard data={contentData} />
          </div>
          {/* 右对齐：用户的确认决策 */}
          <div className="flex items-center justify-end gap-2">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
              bg-emerald-50 border border-emerald-200/60 text-emerald-700
              text-xs font-medium select-none">
              <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
              <span>{labels.join('、') || '已确认'}</span>
            </div>
          </div>
          {/* 自定义反馈（如果有） */}
          {customInput && customInput.trim() && (
            <div className="flex justify-end">
              <span className="inline-block px-4 py-2 rounded-xl bg-gray-900 text-white text-[12px]"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                {customInput}
              </span>
            </div>
          )}
        </div>
      );
    }

    // 普通用户消息 / 无内容的确认 → 右对齐
    return (
      <div className="flex justify-end">
        <HITLResponseMessage message={message} />
      </div>
    );
  }

  // ── HITL 提问：左对齐的对话气泡 ──
  if (isHITLRequest(message)) {
    const { question, options = [] } = message.askUser!;
    return (
      <div className="flex items-start gap-2.5 max-w-[75%]">
        <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-50 border border-amber-200/60 flex items-center justify-center shrink-0">
          <MessageSquare className="w-2.5 h-2.5 text-amber-500" />
        </div>
        <div className="space-y-2">
          <p className="text-[13px] text-gray-700 leading-relaxed tracking-[-0.005em]">{question}</p>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((opt) => (
                <span
                  key={opt.id}
                  className="text-[11px] px-2.5 py-[3px] rounded-full bg-black/[0.04] text-gray-500 font-medium"
                >
                  {opt.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isCurrentlyStreaming = isStreaming && index === total - 1;
  const isLastMessage = index === total - 1;
  const effectiveEvents = isCurrentlyStreaming
    ? liveEvents
    : (isLastMessage && liveEvents.length > 0)
      ? liveEvents
      : message.events || [];
  const isHistoricalMessage = !isStreaming || index < total - 1;
  const isLastAssistantMessage = index === total - 1 || nextMessageRole !== 'assistant';

  const timeline = buildAgentTimeline({
    events: effectiveEvents,
    messageContent: message.content || '',
    imageTasks,
    isStreaming: isCurrentlyStreaming,
    isHistoricalMessage,
    isLastAssistantMessage,
    isHITLRequest: !!message.askUser,
    streamPhase,
  });

  // ── 历史 assistant 执行轨迹：不渲染（底部有完整的最新时间线） ──
  if (!isCurrentlyStreaming && hasLaterAssistant && timeline.hasOutputs) {
    return null;
  }

  // ── 纯文本 assistant 消息 ──
  if (!timeline.hasOutputs && message.content) {
    return (
      <div className="bg-gray-50 rounded-xl px-4 py-3">
        <Markdown content={message.content} className="text-xs text-gray-700" />
      </div>
    );
  }

  // ── 当前/最新的执行时间线 ──
  return (
    <AgentTimelineView
      timeline={timeline}
      isStreaming={isCurrentlyStreaming}
      onImageClick={onImageClick}
    />
  );
}

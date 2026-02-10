import type { AgentEvent, ChatMessage, ImageTask } from '../../types';
import { Markdown } from '@/components/ui/markdown';
import { buildAgentTimeline } from '../../utils/buildAgentTimeline';
import { AgentTimelineView } from './AgentTimelineView';
import { HITLResponseMessage, isHITLRequest } from '../HITLMessage';
import { MessageSquare } from 'lucide-react';

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
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <HITLResponseMessage message={message} />
      </div>
    );
  }

  // HITL 请求：只渲染紧凑的行内提示，不渲染大卡片
  // 实际的交互 UI 由 InteractiveHITLBubble 负责
  if (isHITLRequest(message)) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 bg-amber-50/60 border border-amber-100 rounded-lg w-fit">
        <MessageSquare className="w-3 h-3 text-amber-500 flex-shrink-0" />
        <span>{message.askUser?.question || '等待确认'}</span>
      </div>
    );
  }

  const isCurrentlyStreaming = isStreaming && index === total - 1;
  const isLastMessage = index === total - 1;
  // 对最后一条 assistant 消息，优先使用 liveEvents（Zustand 实时事件），
  // 即使 isStreaming=false，也能拿到完整的 agent_end 等生命周期事件
  const effectiveEvents = isCurrentlyStreaming
    ? liveEvents
    : (isLastMessage && liveEvents.length > 0)
      ? liveEvents
      : message.events || [];
  const isHistoricalMessage = !isStreaming || index < total - 1;
  const isLastAssistantMessage = index === total - 1 || nextMessageRole !== 'assistant';

  // 简化：直接调用 buildAgentTimeline，避免 useMemo 导致的循环问题
  // 优化：buildAgentTimeline 本身应该足够快，对于大多数情况
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

  // 历史 assistant 消息仅显示紧凑摘要，避免出现上下重复的完整执行轨迹
  if (!isCurrentlyStreaming && hasLaterAssistant && timeline.hasOutputs) {
    const stepCount = [
      ...timeline.historyStages,
      ...(timeline.currentStage ? [timeline.currentStage] : []),
    ].reduce((acc, stage) => acc + stage.groups.length, 0);

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">
        历史执行轨迹（{stepCount} 步）已折叠
      </div>
    );
  }

  if (!timeline.hasOutputs && message.content) {
    return (
      <div className="bg-gray-50 rounded-xl px-4 py-3">
        <Markdown content={message.content} className="text-xs text-gray-700" />
      </div>
    );
  }

  return (
    <AgentTimelineView
      timeline={timeline}
      isStreaming={isCurrentlyStreaming}
      onImageClick={onImageClick}
    />
  );
}

import { Bot, Wrench, CheckCircle, MessageSquare, AlertCircle } from 'lucide-react';
import type { AgentEvent } from '@/features/agent/types';

interface AgentEventTimelineProps {
  events: AgentEvent[];
  className?: string;
}

export function AgentEventTimeline({ events, className }: AgentEventTimelineProps) {
  const getEventIcon = (event: AgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        return <Bot className="w-4 h-4 text-blue-500" />;
      case 'tool_call':
        return <Wrench className="w-4 h-4 text-orange-500" />;
      case 'agent_end':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {events.map((event, index) => (
        <div key={index} className="flex items-start gap-3 text-sm">
          <div className="mt-1">
            {getEventIcon(event)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {event.agent || event.type}
            </p>
            {event.content && (
              <p className="text-muted-foreground line-clamp-2">{event.content}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

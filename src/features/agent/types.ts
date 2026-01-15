export interface AgentEvent {
  type: 'agent_start' | 'agent_end' | 'tool_call' | 'tool_result' | 'message';
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  events?: AgentEvent[];
}

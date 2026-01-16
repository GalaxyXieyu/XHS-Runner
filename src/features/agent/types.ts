export interface AgentEvent {
  type: 'agent_start' | 'agent_end' | 'tool_call' | 'tool_result' | 'message';
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
  // 批量图片生成相关
  taskIds?: number[];
  prompts?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  events?: AgentEvent[];
}

export interface ImageTask {
  id: number;
  prompt: string;
  status: 'queued' | 'generating' | 'done' | 'failed' | 'canceled';
  assetId?: number;
  errorMessage?: string;
}

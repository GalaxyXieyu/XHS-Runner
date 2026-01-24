// askUser 选项类型
export interface AskUserOption {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
}

export interface AgentEvent {
  type: 'agent_start' | 'agent_end' | 'tool_call' | 'tool_result' | 'message' | 'ask_user' | 'workflow_paused';
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
  // 批量图片生成相关
  taskIds?: number[];
  prompts?: string[];
  // askUser 相关
  question?: string;
  options?: AskUserOption[];
  selectionType?: 'single' | 'multiple' | 'none';
  allowCustomInput?: boolean;
  context?: Record<string, unknown>;
  threadId?: string;
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

// askUser 对话框状态
export interface AskUserDialogState {
  isOpen: boolean;
  question: string;
  options: AskUserOption[];
  selectionType: 'single' | 'multiple' | 'none';
  allowCustomInput: boolean;
  threadId: string;
  selectedIds: string[];
  customInput: string;
}

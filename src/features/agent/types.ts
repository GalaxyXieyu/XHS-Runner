// askUser 选项类型
export interface AskUserOption {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
}

export interface AgentEvent {
  type: 'agent_start' | 'agent_end' | 'tool_call' | 'tool_result' | 'message' | 'ask_user' | 'workflow_paused' | 'confirmation_required' | 'intent_detected' | 'content_type_detected' | 'supervisor_decision' | 'state_update' | 'image_progress' | 'content_update' | 'workflow_progress';
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
  // 内容确认相关
  confirmationType?: 'content' | 'image_plans';
  data?: {
    title?: string;
    content?: string;
    tags?: string[];
  } | any[];
  // 意图检测相关
  intent?: string;
  confidence?: number;
  suggestedCategory?: string;
  keywords?: string[];
  // 内容类型检测相关
  contentType?: string;
  reasoning?: string;
  // supervisor 决策相关
  decision?: string;
  reason?: string;
  // 状态更新相关
  changes?: string;
  // 图片进度相关 (新增)
  taskId?: number;
  status?: 'queued' | 'generating' | 'complete' | 'failed';
  progress?: number;
  url?: string;
  errorMessage?: string;
  // 内容更新相关 (新增)
  title?: string;
  body?: string;
  tags?: string[];
  // 工作流进度相关 (新增)
  phase?: string;
  currentAgent?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  events?: AgentEvent[];
  confirmation?: {
    type: 'content' | 'image_plans';
    data: any;
    threadId: string;
  };
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

// 内容确认对话框状态
export interface ContentConfirmationState {
  isOpen: boolean;
  threadId: string;
  title: string;
  content: string;
  tags: string[];
}

import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// Agent 类型
export type AgentType = "supervisor" | "research_agent" | "writer_agent" | "style_analyzer_agent" | "image_planner_agent" | "image_agent" | "review_agent";

// 风格分析结果类型
export interface StyleAnalysis {
  style: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  lighting: string;
  texture: string;
  layout?: string;
  textDensity?: string;
  elementaryComponents?: string[];
  description: string;
}

// 图片规划类型
export interface ImagePlan {
  sequence: number;
  role: string;
  description: string;
  prompt?: string;
}

// 审核反馈类型
export interface ReviewFeedback {
  approved: boolean;
  suggestions: string[];
  targetAgent?: string;
  optimizedPrompts?: string[];
}

// HITL 确认类型
export interface PendingConfirmation {
  type: "image_plans" | "content";
  data: ImagePlan[] | { title: string; body: string; tags: string[] };
  timestamp: number;
}

// State 定义
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    value: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentAgent: Annotation<AgentType>({
    value: (_, y) => y,
    default: () => "supervisor" as AgentType,
  }),
  researchComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  contentComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  referenceImageUrl: Annotation<string | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  referenceImages: Annotation<string[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  styleAnalysis: Annotation<StyleAnalysis | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  imagePlans: Annotation<ImagePlan[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  creativeId: Annotation<number | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  reviewFeedback: Annotation<ReviewFeedback | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  imagesComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  generatedImageCount: Annotation<number>({
    value: (x, y) => Math.max(x, y),
    default: () => 0,
  }),
  generatedImagePaths: Annotation<string[]>({
    value: (x, y) => [...x, ...y],
    default: () => [],
  }),
  generatedImageAssetIds: Annotation<number[]>({
    value: (x, y) => [...x, ...y],
    default: () => [],
  }),
  iterationCount: Annotation<number>({
    value: (_, y) => y,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    value: (_, y) => y,
    default: () => 3,
  }),
  imageGenProvider: Annotation<string>({
    value: (_, y) => y,
    default: () => "jimeng",
  }),
  // HITL 相关状态
  pendingConfirmation: Annotation<PendingConfirmation | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  threadId: Annotation<string>({
    value: (_, y) => y,
    default: () => "",
  }),
  userFeedback: Annotation<string | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  regenerationCount: Annotation<number>({
    value: (_, y) => y,
    default: () => 0,
  }),
  maxRegenerations: Annotation<number>({
    value: (_, y) => y,
    default: () => 3,
  }),
  // 上下文压缩：对话摘要
  summary: Annotation<string>({
    value: (_, y) => y,
    default: () => "",
  }),
  // 内容类型模板
  contentType: Annotation<string>({
    value: (_, y) => y,
    default: () => "product",
  }),
});

// Agent 执行事件类型
export interface AgentEvent {
  type:
    | "agent_start"
    | "agent_end"
    | "tool_call"
    | "tool_result"
    | "message"
    | "progress"
    | "ask_user"
    | "workflow_paused"
    | "state_update"
    | "image_progress"
    | "content_update"
    | "workflow_progress";
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
  // ask_user
  question?: string;
  options?: Array<{ id: string; label: string; description?: string; imageUrl?: string }>;
  selectionType?: "single" | "multiple" | "none";
  allowCustomInput?: boolean;
  context?: Record<string, unknown>;
  threadId?: string;
  // 其他扩展字段
  [key: string]: any;
}

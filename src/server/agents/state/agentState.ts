import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// Agent 类型
export type AgentType =
  | "supervisor"
  | "brief_compiler_agent"
  | "research_agent"
  | "reference_intelligence_agent"
  | "layout_planner_agent"
  | "writer_agent"
  | "image_planner_agent"
  | "image_agent"
  | "review_agent";

export type ReferenceInputType = "style" | "layout" | "content";
export type ReferenceAnalysisType = "style_ref" | "layout_ref" | "content_ref" | "mixed_ref";
export type LayoutPreference = "dense" | "balanced" | "visual-first";

export interface CreativeBrief {
  audience: string;
  goal: string;
  keyPoints: string[];
  callToAction: string;
  bannedExpressions: string[];
  tone: string;
}

export interface EvidenceItem {
  fact: string;
  source?: string;
  quote?: string;
}

export interface EvidencePack {
  items: EvidenceItem[];
  summary: string;
}

export interface BodyBlock {
  id: string;
  text: string;
  intent: string;
  keywords: string[];
}

export interface ReferenceInput {
  url: string;
  type?: ReferenceInputType;
}

export interface ReferenceAnalysis {
  index: number;
  url: string;
  type: ReferenceAnalysisType;
  confidence: number;
  styleTokens: {
    colorPalette: string[];
    mood: string;
    lighting: string;
    styleKeywords: string[];
  };
  layoutTokens: {
    layout: string;
    textDensity: string;
    composition: string;
  };
  contentTokens: {
    elements: string[];
    scene: string;
  };
  rawAnalysis: string;
}

export interface LayoutBlockSpec {
  area: "title" | "body" | "visual_focus" | "footer";
  instruction: string;
}

export interface LayoutSpec {
  imageSeq: number;
  role: string;
  visualFocus: string;
  textDensity: string;
  blocks: LayoutBlockSpec[];
}

export interface TextOverlayPlan {
  imageSeq: number;
  titleText?: string;
  bodyText?: string;
  placement: "top" | "center" | "bottom";
}

export interface QualityDimensionScores {
  infoDensity: number;
  textImageAlignment: number;
  styleConsistency: number;
  readability: number;
  platformFit: number;
}

export interface QualityScores {
  scores: QualityDimensionScores;
  overall: number;
  failReasons: string[];
}

export interface SupervisorDecision {
  nextAgent: AgentType | "END";
  guidance: string;
  contextFromPrevious: string;
  focusAreas: string[];
}

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
  scores?: QualityDimensionScores;
  overall?: number;
  rerouteTarget?: AgentType;
}

// HITL 确认类型
export interface PendingConfirmation {
  type: "image_plans" | "content";
  data:
    | ImagePlan[]
    | {
        title: string;
        body: string;
        tags: string[];
      }
    | {
        layoutSpec: LayoutSpec[];
      };
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
  supervisorDecision: Annotation<SupervisorDecision | null>({
    value: (_, y) => y,
    default: () => null,
  }),

  // 任务阶段完成标记
  briefComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  researchComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  evidenceComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  referenceIntelligenceComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  contentComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  layoutComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),

  // 输入与参考图
  referenceImageUrl: Annotation<string | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  referenceImages: Annotation<string[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  referenceInputs: Annotation<ReferenceInput[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  layoutPreference: Annotation<LayoutPreference>({
    value: (_, y) => y,
    default: () => "balanced",
  }),

  // 结构化中间结果
  creativeBrief: Annotation<CreativeBrief | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  evidencePack: Annotation<EvidencePack | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  bodyBlocks: Annotation<BodyBlock[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  referenceAnalyses: Annotation<ReferenceAnalysis[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  layoutSpec: Annotation<LayoutSpec[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  textOverlayPlan: Annotation<TextOverlayPlan[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  qualityScores: Annotation<QualityScores | null>({
    value: (_, y) => y,
    default: () => null,
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
  lastError: Annotation<string | null>({
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
  clarificationRounds: Annotation<number>({
    value: (_, y) => y,
    default: () => 0,
  }),
  agentClarificationKeys: Annotation<string[]>({
    value: (x, y) => Array.from(new Set([...(x || []), ...(y || [])])),
    default: () => [],
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

  // 生成的内容（统一在流程结束时入库）
  generatedContent: Annotation<{
    title: string;
    body: string;
    tags: string[];
  } | null>({
    value: (_, y) => y,
    default: () => null,
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
    | "workflow_progress"
    | "brief_ready"
    | "layout_spec_ready"
    | "alignment_map_ready"
    | "quality_score"
    | "intent_detected"
    | "content_type_detected"
    | "supervisor_decision"
    | "workflow_complete";
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

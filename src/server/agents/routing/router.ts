import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentState, type AgentType, type QualityScores, type StyleAnalysis } from "../state/agentState";

const MODERATE_THRESHOLDS = {
  infoDensity: 0.65,
  textImageAlignment: 0.7,
  styleConsistency: 0.65,
  readability: 0.7,
  platformFit: 0.65,
  overall: 0.72,
};

// 检查 supervisor 是否有工具调用
export function shouldContinueSupervisor(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "supervisor_tools";
  }
  return "route";
}

function getRerouteTargetByScores(qualityScores: QualityScores | null): AgentType | null {
  if (!qualityScores) return null;

  const scores = qualityScores.scores;

  if (scores.infoDensity < MODERATE_THRESHOLDS.infoDensity) {
    return "research_evidence_agent";
  }
  if (scores.textImageAlignment < MODERATE_THRESHOLDS.textImageAlignment) {
    return "layout_planner_agent";
  }
  if (scores.styleConsistency < MODERATE_THRESHOLDS.styleConsistency) {
    return "reference_intelligence_agent";
  }
  if (scores.readability < MODERATE_THRESHOLDS.readability) {
    return "image_planner_agent";
  }
  if (scores.platformFit < MODERATE_THRESHOLDS.platformFit) {
    return "writer_agent";
  }

  return null;
}

function isQualityApproved(qualityScores: QualityScores | null): boolean {
  if (!qualityScores) return false;
  return qualityScores.overall >= MODERATE_THRESHOLDS.overall;
}

export function routeFromSupervisor(state: typeof AgentState.State): string {
  console.log("[routeFromSupervisor] 开始路由决策");

  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

  // 从 LLM 决策中提取
  if (content.includes("NEXT: brief_compiler_agent")) return "brief_compiler_agent";
  if (content.includes("NEXT: research_evidence_agent")) return "research_evidence_agent";
  if (content.includes("NEXT: reference_intelligence_agent")) return "reference_intelligence_agent";
  if (content.includes("NEXT: layout_planner_agent")) return "layout_planner_agent";
  if (content.includes("NEXT: research_agent")) return "research_agent";
  if (content.includes("NEXT: writer_agent")) return "writer_agent";
  if (content.includes("NEXT: style_analyzer_agent")) return "style_analyzer_agent";
  if (content.includes("NEXT: image_planner_agent")) return "image_planner_agent";
  if (content.includes("NEXT: image_agent")) return "image_agent";
  if (content.includes("NEXT: review_agent")) return "review_agent";
  if (content.includes("NEXT: END")) return END;

  // 审核回流优先
  if (state.reviewFeedback && !state.reviewFeedback.approved) {
    if (state.iterationCount >= state.maxIterations) {
      return END;
    }

    if (state.qualityScores) {
      const reroute = getRerouteTargetByScores(state.qualityScores);
      if (reroute === "research_evidence_agent") return "research_evidence_agent";
      if (reroute === "layout_planner_agent") return "layout_planner_agent";
      if (reroute === "reference_intelligence_agent") return "reference_intelligence_agent";
      if (reroute === "writer_agent") return "writer_agent";
      return "image_planner_agent";
    }

    if (state.reviewFeedback.targetAgent) {
      if (state.reviewFeedback.targetAgent === "writer_agent") return "writer_agent";
      if (state.reviewFeedback.targetAgent === "image_planner_agent") return "image_planner_agent";
      if (state.reviewFeedback.targetAgent === "image_agent") return "image_agent";
    }
  }

  // 全流程默认决策
  if (!state.briefComplete) {
    return "brief_compiler_agent";
  }

  if (!state.evidenceComplete) {
    return "research_evidence_agent";
  }

  if (!state.referenceIntelligenceComplete) {
    return "reference_intelligence_agent";
  }

  if (!state.contentComplete) {
    return "writer_agent";
  }

  if (!state.layoutComplete) {
    return "layout_planner_agent";
  }

  // image_planner 必须看到正文（分块由 planner 内部 AI 完成）
  if (!state.generatedContent?.body || !state.generatedContent.body.trim()) {
    return "writer_agent";
  }

  if (state.imagePlans.length === 0 || state.paragraphImageBindings.length === 0) {
    return "image_planner_agent";
  }

  if (!state.imagesComplete) {
    return "image_agent";
  }

  if (!state.reviewFeedback) {
    return "review_agent";
  }

  if (state.reviewFeedback.approved) {
    if (state.qualityScores) {
      return isQualityApproved(state.qualityScores) ? END : "supervisor";
    }
    return END;
  }

  return "supervisor";
}

export function shouldContinueResearch(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "research_tools";
  }
  return "supervisor";
}

// 按 thread 隔离 image_agent 工具调用次数，避免并发串扰
const imageToolCallCounterByThread = new Map<string, number>();
const MAX_IMAGE_TOOL_CALLS = 10;

export function resetImageToolCallCount(threadId = "global") {
  imageToolCallCounterByThread.delete(threadId);
}

export function shouldContinueImage(state: typeof AgentState.State): string {
  if (state.imagesComplete) {
    return "supervisor";
  }

  const lastMessage = state.messages[state.messages.length - 1];
  const threadId = state.threadId || "global";

  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    const nextCount = (imageToolCallCounterByThread.get(threadId) || 0) + 1;
    imageToolCallCounterByThread.set(threadId, nextCount);
    if (nextCount >= MAX_IMAGE_TOOL_CALLS) {
      return "supervisor";
    }
    return "image_tools";
  }

  return "supervisor";
}

export function shouldContinueStyle(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "style_tools";
  }
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";
  let styleAnalysis: StyleAnalysis | null = null;
  try {
    const jsonMatch = content.match(/\{[\s\S]*"style"[\s\S]*\}/);
    if (jsonMatch) {
      styleAnalysis = JSON.parse(jsonMatch[0]);
    }
  } catch {}
  if (styleAnalysis) {
    return "supervisor_with_style";
  }
  return "supervisor";
}

// review_agent 路由：质量达标直接 END，否则回 supervisor
export function shouldContinueReview(state: typeof AgentState.State): string {
  if (state.reviewFeedback?.approved && isQualityApproved(state.qualityScores)) {
    return END;
  }
  return "supervisor";
}

import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentState, type AgentType, type QualityScores } from "../state/agentState";
import { parseSupervisorDecision } from "../utils";
import { REVIEW_THRESHOLDS } from "../utils/reviewThresholds";

const MODERATE_THRESHOLDS = REVIEW_THRESHOLDS;

const CRITICAL_RECOVERY_ERRORS = new Set([
  "MISSING_BODY_FOR_IMAGE_PLANNER",
  "MISSING_BODY_FOR_LAYOUT",
  "WRITER_EMPTY_BODY",
]);

type RouteDecision = AgentType | typeof END | "supervisor";

const ROUTE_STAGE_ORDER: Record<AgentType, number> = {
  supervisor: 0,
  brief_compiler_agent: 10,
  research_agent: 20,
  reference_intelligence_agent: 30,
  writer_agent: 40,
  layout_planner_agent: 50,
  image_planner_agent: 60,
  image_agent: 70,
  review_agent: 80,
};

function shouldRespectDeterministicRoute(state: typeof AgentState.State): boolean {
  if (state.lastError && CRITICAL_RECOVERY_ERRORS.has(state.lastError)) {
    return true;
  }

  if (state.iterationCount >= state.maxIterations) {
    return true;
  }

  return false;
}

function canUseLlmBacktrackRoute(
  llmRoute: RouteDecision | null,
  deterministicRoute: RouteDecision,
  state: typeof AgentState.State
): llmRoute is AgentType {
  if (!llmRoute || llmRoute === END) return false;

  if (shouldRespectDeterministicRoute(state)) {
    return false;
  }

  // 当状态机认为可以结束时，允许 supervisor 主动回退到更早阶段继续优化。
  if (deterministicRoute === END) {
    return true;
  }

  if (deterministicRoute === "supervisor") {
    return llmRoute === "supervisor";
  }

  // review 作为最终质量门禁，不允许 supervisor 在进入 review 前跳回更早阶段。
  if (deterministicRoute === "review_agent") {
    return llmRoute === "review_agent";
  }

  const llmStage = ROUTE_STAGE_ORDER[llmRoute];
  const deterministicStage = ROUTE_STAGE_ORDER[deterministicRoute];

  if (!Number.isFinite(llmStage) || !Number.isFinite(deterministicStage)) {
    return false;
  }

  // 允许向前到下一阶段（正常流程推进）或回退（优化迭代）
  // 只有当 LLM 路由比确定性路由超前超过一个阶段时才拒绝（避免跳过关键阶段）
  const STAGE_THRESHOLD = 15; // 允许最多超前一个阶段（如从 10 到 20）
  if (llmStage > deterministicStage + STAGE_THRESHOLD) {
    return false; // 拒绝：LLM 试图跳过太多阶段
  }
  return true;
}

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
    return "research_agent";
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
  const scores = qualityScores.scores;
  return (
    scores.infoDensity >= MODERATE_THRESHOLDS.infoDensity &&
    scores.textImageAlignment >= MODERATE_THRESHOLDS.textImageAlignment &&
    scores.styleConsistency >= MODERATE_THRESHOLDS.styleConsistency &&
    scores.readability >= MODERATE_THRESHOLDS.readability &&
    scores.platformFit >= MODERATE_THRESHOLDS.platformFit &&
    qualityScores.overall >= MODERATE_THRESHOLDS.overall
  );
}

function extractNextFromSupervisor(content: string): RouteDecision | null {
  const decision = parseSupervisorDecision(content);
  if (!decision) return null;
  if (decision.nextAgent === "END") return END;
  return decision.nextAgent;
}

function getDeterministicRoute(state: typeof AgentState.State): RouteDecision {
  if (state.lastError && CRITICAL_RECOVERY_ERRORS.has(state.lastError)) {
    return "writer_agent";
  }

  if (state.fastMode) {
    if (!state.evidenceComplete) {
      return "research_agent";
    }
    if (!state.referenceIntelligenceComplete) {
      return "reference_intelligence_agent";
    }
    if (!state.contentComplete || !state.generatedContent?.body || !state.generatedContent.body.trim()) {
      return "writer_agent";
    }
    if (state.imagePlans.length === 0) {
      return "image_planner_agent";
    }
    if (!state.imagesComplete) {
      return "image_agent";
    }
    return END;
  }

  // briefComplete 为 true 时表示 brief 已完成，不应再返回 brief_compiler_agent
  // 让后续逻辑检查是否需要继续到 research_agent
  if (!state.briefComplete && !state.creativeBrief) {
    return "brief_compiler_agent";
  }

  if (!state.evidenceComplete) {
    return "research_agent";
  }

  if (!state.referenceIntelligenceComplete) {
    return "reference_intelligence_agent";
  }

  if (!state.contentComplete || !state.generatedContent?.body || !state.generatedContent.body.trim()) {
    return "writer_agent";
  }

  if (!state.layoutComplete) {
    return "layout_planner_agent";
  }

  if (state.imagePlans.length === 0) {
    return "image_planner_agent";
  }

  if (!state.imagesComplete) {
    return "image_agent";
  }

  if (!state.reviewFeedback) {
    return "review_agent";
  }

  if (state.reviewFeedback.approved) {
    if (isQualityApproved(state.qualityScores)) {
      return END;
    }

    // 审核“口头通过”但分数未达标时，按低分维度回流。
    return getRerouteTargetByScores(state.qualityScores) || "review_agent";
  }

  if (state.iterationCount >= state.maxIterations) {
    return END;
  }

  return getRerouteTargetByScores(state.qualityScores)
    || state.reviewFeedback.targetAgent as AgentType
    || "image_planner_agent";
}

export function routeFromSupervisor(state: typeof AgentState.State): string {
  console.log("[routeFromSupervisor] 开始路由决策");

  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

  const decision = state.supervisorDecision;
  const llmRoute = decision
    ? (decision.nextAgent === "END" ? END : decision.nextAgent)
    : extractNextFromSupervisor(content);
  const deterministicRoute = getDeterministicRoute(state);

  if (state.fastMode) {
    return deterministicRoute;
  }

  if (canUseLlmBacktrackRoute(llmRoute, deterministicRoute, state)) {
    if (llmRoute !== deterministicRoute) {
      const deterministicLabel = typeof deterministicRoute === "string" ? deterministicRoute : "END";
      console.log(`[routeFromSupervisor] 采用 supervisor 回退路由 ${llmRoute}（状态机默认 ${deterministicLabel}）`);
    }
    return llmRoute;
  }

  if (llmRoute && llmRoute !== deterministicRoute) {
    const llmLabel = typeof llmRoute === "string" ? llmRoute : "END";
    const deterministicLabel = typeof deterministicRoute === "string" ? deterministicRoute : "END";
    console.warn(`[routeFromSupervisor] 忽略不安全 LLM 路由 ${llmLabel}，采用 ${deterministicLabel}`);
  }

  return deterministicRoute;
}

export function shouldReturnToSupervisor(state: typeof AgentState.State): string {
  return state.fastMode ? "supervisor_route" : "supervisor";
}

// 按 thread 隔离工具调用次数，避免并发串扰
const researchToolCallCounterByThread = new Map<string, number>();
const imageToolCallCounterByThread = new Map<string, number>();
const MAX_RESEARCH_TOOL_CALLS = 3;
const MAX_IMAGE_TOOL_CALLS = 10;

export function resetResearchToolCallCount(threadId: string) {
  if (!threadId) return;
  researchToolCallCounterByThread.delete(threadId);
}

export function resetImageToolCallCount(threadId: string) {
  if (!threadId) return;
  imageToolCallCounterByThread.delete(threadId);
}

export function shouldContinueResearch(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  const threadId = state.threadId;

  if (!threadId) {
    console.warn("[shouldContinueResearch] missing threadId, fallback to supervisor");
    return state.fastMode ? "supervisor_route" : "supervisor";
  }

  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    const toolCallCount = (lastMessage as AIMessage).tool_calls!.length;
    const currentCount = researchToolCallCounterByThread.get(threadId) || 0;

    console.log(`[shouldContinueResearch] 工具调用次数: ${currentCount}, 本次请求: ${toolCallCount}`);

    // 如果已经达到上限，不再执行新的工具调用
    if (currentCount >= MAX_RESEARCH_TOOL_CALLS) {
      console.log(`[shouldContinueResearch] 已达到工具调用上限 ${MAX_RESEARCH_TOOL_CALLS}，结束研究`);
      return state.fastMode ? "supervisor_route" : "supervisor";
    }

    // 先执行工具调用，然后更新计数
    // 这样即使本次调用后超过上限，至少这批工具调用会被执行
    const nextCount = currentCount + toolCallCount;
    researchToolCallCounterByThread.set(threadId, nextCount);

    console.log(`[shouldContinueResearch] 执行工具调用，累计: ${nextCount}`);
    return "research_tools";
  }
  return state.fastMode ? "supervisor_route" : "supervisor";
}

export function shouldContinueImage(state: typeof AgentState.State): string {
  if (state.imagesComplete) {
    return state.fastMode ? "supervisor_route" : "supervisor";
  }

  const lastMessage = state.messages[state.messages.length - 1];
  const threadId = state.threadId;
  if (!threadId) {
    console.warn("[shouldContinueImage] missing threadId, fallback to supervisor");
    return state.fastMode ? "supervisor_route" : "supervisor";
  }

  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    const nextCount = (imageToolCallCounterByThread.get(threadId) || 0) + 1;
    imageToolCallCounterByThread.set(threadId, nextCount);
    if (nextCount >= MAX_IMAGE_TOOL_CALLS) {
      return state.fastMode ? "supervisor_route" : "supervisor";
    }
    return "image_tools";
  }

  return state.fastMode ? "supervisor_route" : "supervisor";
}

// review_agent 路由：质量达标直接 END，否则回 supervisor
export function shouldContinueReview(state: typeof AgentState.State): string {
  if (state.fastMode) {
    return END;
  }
  if (state.reviewFeedback?.approved && isQualityApproved(state.qualityScores)) {
    return END;
  }
  return "supervisor";
}

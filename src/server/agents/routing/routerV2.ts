import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentState, type AgentType, type QualityScores } from "../state/agentState";
import { parseSupervisorDecision } from "../utils";
import { REVIEW_THRESHOLDS } from "../utils/reviewThresholds";

type RouteDecision = AgentType | typeof END;

/**
 * 检查最基本的前置条件（只防止明显错误）
 *
 * 注意：这里只检查最基本的前置条件，不要加太多限制
 * 如果 Supervisor 经常触发这些检查，说明需要优化提示词
 */
function checkBasicPreconditions(
  targetAgent: AgentType,
  state: typeof AgentState.State
): { satisfied: boolean; missing: string[]; fallback?: string } {
  // writer_agent 需要 brief（至少要有 brief 或 creativeBrief）
  if (targetAgent === "writer_agent") {
    if (!state.creativeBrief && !state.briefComplete) {
      return {
        satisfied: false,
        missing: ["writer_agent 需要 brief"],
        fallback: "brief_compiler_agent",
      };
    }
  }

  // review_agent 需要有内容才能审核
  if (targetAgent === "review_agent") {
    if (!state.generatedContent?.body && !state.contentComplete) {
      return {
        satisfied: false,
        missing: ["review_agent 需要有内容才能审核"],
        fallback: "writer_agent",
      };
    }
  }

  // image_agent 需要有图片规划
  if (targetAgent === "image_agent") {
    if (state.imagePlans.length === 0) {
      return {
        satisfied: false,
        missing: ["image_agent 需要图片规划"],
        fallback: "image_planner_agent",
      };
    }
  }

  return { satisfied: true, missing: [] };
}

// 从 Supervisor 消息提取路由决策
function extractSupervisorDecision(content: string): RouteDecision | null {
  const decision = parseSupervisorDecision(content);
  if (!decision) return null;
  if (decision.nextAgent === "END") return END;
  return decision.nextAgent;
}

// 质量回退逻辑
function getRerouteTargetByScores(qualityScores: QualityScores | null): AgentType | null {
  if (!qualityScores) return null;

  const scores = qualityScores.scores;
  const thresholds = REVIEW_THRESHOLDS;

  if (scores.infoDensity < thresholds.infoDensity) {
    return "research_evidence_agent";
  }
  if (scores.textImageAlignment < thresholds.textImageAlignment) {
    return "layout_planner_agent";
  }
  if (scores.styleConsistency < thresholds.styleConsistency) {
    return "reference_intelligence_agent";
  }
  if (scores.readability < thresholds.readability) {
    return "image_planner_agent";
  }
  if (scores.platformFit < thresholds.platformFit) {
    return "writer_agent";
  }

  return null;
}

// 判断质量是否达标
function isQualityApproved(qualityScores: QualityScores | null): boolean {
  if (!qualityScores) return false;

  const scores = qualityScores.scores;
  const thresholds = REVIEW_THRESHOLDS;

  return (
    scores.infoDensity >= thresholds.infoDensity &&
    scores.textImageAlignment >= thresholds.textImageAlignment &&
    scores.styleConsistency >= thresholds.styleConsistency &&
    scores.readability >= thresholds.readability &&
    scores.platformFit >= thresholds.platformFit &&
    qualityScores.overall >= thresholds.overall
  );
}

/**
 * Supervisor 路由决策 - 完全以 LLM 为中心
 *
 * 设计原则：
 * 1. Supervisor 的决策是首要的
 * 2. 只在明显的前置条件缺失时才纠正（如没有 brief 就不能生成内容）
 * 3. 如果 LLM 决策有问题，优化提示词，而不是加更多限制
 */
export function routeFromSupervisor(state: typeof AgentState.State): string {
  console.log("[routeFromSupervisor] 开始路由决策");

  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

  // 提取 Supervisor 的决策
  const decision = state.supervisorDecision;
  const supervisorDecision = decision
    ? (decision.nextAgent === "END" ? END : decision.nextAgent)
    : extractSupervisorDecision(content);

  if (!supervisorDecision) {
    // Supervisor 没有提供决策，这是个提示词问题
    console.error("[routeFromSupervisor] Supervisor 没有提供有效决策！请检查 supervisor 提示词");
    // 兜底：返回 supervisor 让它重新决策
    return "supervisor";
  }

  // 如果决策是 END
  if (supervisorDecision === END) {
    if (canEndWorkflow(state)) {
      console.log("[routeFromSupervisor] 流程结束");
      return END;
    }
    console.warn("[routeFromSupervisor] Supervisor 想结束但条件不满足，请检查提示词逻辑");
    // 返回 supervisor 让它重新决策
    return "supervisor";
  }

  // 只检查最基本的前置条件（避免明显错误）
  const deps = checkBasicPreconditions(supervisorDecision, state);

  if (!deps.satisfied) {
    console.warn(`[routeFromSupervisor] ${supervisorDecision} 缺少基本前置:`, deps.missing);
    console.warn(`[routeFromSupervisor] 这可能是 Supervisor 提示词需要优化的信号`);
    // 只在明显错误时纠正
    return deps.fallback || "supervisor";
  }

  // 使用 Supervisor 的决策
  console.log(`[routeFromSupervisor] 采用 Supervisor 决策: ${supervisorDecision}`);
  return supervisorDecision;
}

/**
 * 判断是否可以结束工作流
 */
function canEndWorkflow(state: typeof AgentState.State): boolean {
  // 必须有生成的内容
  if (!state.generatedContent?.body) {
    return false;
  }

  // 如果有审核反馈，必须通过
  if (state.reviewFeedback) {
    if (!state.reviewFeedback.approved) {
      return false;
    }
    if (!isQualityApproved(state.qualityScores)) {
      return false;
    }
  }

  return true;
}

// ========== 以下是为保持兼容性的辅助函数 ==========

// ========== 以下是为保持兼容性的辅助函数 ==========

// 检查 supervisor 是否有工具调用
export function shouldContinueSupervisor(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "supervisor_tools";
  }
  return "route";
}

// research_evidence_agent 继续判断
export function shouldContinueResearch(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "research_evidence_tools";
  }
  return "supervisor";
}

// image_agent 继续判断
const imageToolCallCounterByThread = new Map<string, number>();
const MAX_IMAGE_TOOL_CALLS = 10;

export function resetImageToolCallCount(threadId: string) {
  if (!threadId) return;
  imageToolCallCounterByThread.delete(threadId);
}

export function shouldContinueImage(state: typeof AgentState.State): string {
  if (state.imagesComplete) {
    return "supervisor";
  }

  const lastMessage = state.messages[state.messages.length - 1];
  const threadId = state.threadId;

  if (!threadId) {
    console.warn("[shouldContinueImage] missing threadId, fallback to supervisor");
    return "supervisor";
  }

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

// review_agent 路由
export function shouldContinueReview(state: typeof AgentState.State): string {
  if (state.reviewFeedback?.approved && isQualityApproved(state.qualityScores)) {
    return END;
  }
  return "supervisor";
}

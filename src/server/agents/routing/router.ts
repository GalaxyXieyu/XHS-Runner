import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { AgentState, type StyleAnalysis } from "../state/agentState";

// 检查 supervisor 是否有工具调用
export function shouldContinueSupervisor(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "supervisor_tools";
  }
  return "route";
}

export function routeFromSupervisor(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

  if (content.includes("NEXT: research_agent")) return "research_agent";
  if (content.includes("NEXT: writer_agent")) return "writer_agent";
  if (content.includes("NEXT: style_analyzer_agent")) return "style_analyzer_agent";
  if (content.includes("NEXT: image_planner_agent")) return "image_planner_agent";
  if (content.includes("NEXT: image_agent")) return "image_agent";
  if (content.includes("NEXT: review_agent")) return "review_agent";
  if (content.includes("NEXT: END")) return END;

  // 默认流程
  const hasReferenceImage = state.referenceImageUrl || state.referenceImages.length > 0;
  const needsResearch = !state.researchComplete;
  const needsStyle = hasReferenceImage && !state.styleAnalysis;

  if (needsResearch) return "research_agent";
  if (needsStyle) return "style_analyzer_agent";
  if (!state.contentComplete) return "writer_agent";
  if (state.imagePlans.length === 0) return "image_planner_agent";
  if (!state.imagesComplete) return "image_agent";
  if (!state.reviewFeedback) return "review_agent";

  // 审核未通过：回 supervisor 重新评估，不直接使用 targetAgent
  if (state.reviewFeedback && !state.reviewFeedback.approved) {
    if (state.iterationCount >= state.maxIterations) {
      return END;
    }
    return "supervisor";  // 回 supervisor 重新评估下一步
  }
  return END;
}

export function shouldContinueResearch(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "research_tools";
  }
  return "supervisor";
}

// 跟踪 image_agent 的工具调用次数
let imageToolCallCount = 0;
const MAX_IMAGE_TOOL_CALLS = 10;

export function resetImageToolCallCount() {
  imageToolCallCount = 0;
}

export function shouldContinueImage(state: typeof AgentState.State): string {
  if (state.imagesComplete) {
    return "supervisor";
  }

  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    imageToolCallCount++;
    if (imageToolCallCount >= MAX_IMAGE_TOOL_CALLS) {
      return "supervisor";
    }
    return state.referenceImageUrl ? "reference_image_tools" : "image_tools";
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

// review_agent 路由：approved 直接 END，否则回 supervisor
export function shouldContinueReview(state: typeof AgentState.State): string {
  if (state.reviewFeedback?.approved) {
    return END;
  }
  return "supervisor";
}

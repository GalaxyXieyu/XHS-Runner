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
  console.log("[routeFromSupervisor] 开始路由决策");
  console.log("[routeFromSupervisor] state.messages 长度:", state.messages.length);

  const lastMessage = state.messages[state.messages.length - 1];
  console.log("[routeFromSupervisor] 最后一条消息类型:", lastMessage?.constructor?.name);
  console.log("[routeFromSupervisor] 最后一条消息内容类型:", typeof lastMessage?.content);

  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";
  console.log("[routeFromSupervisor] 提取的内容 (前200字符):", content.slice(0, 200));

  // 从 LLM 决策中提取
  if (content.includes("NEXT: research_agent")) {
    console.log("[Router] LLM决策: research_agent");
    return "research_agent";
  }
  if (content.includes("NEXT: writer_agent")) {
    console.log("[Router] LLM决策: writer_agent");
    return "writer_agent";
  }
  if (content.includes("NEXT: style_analyzer_agent")) {
    console.log("[Router] LLM决策: style_analyzer_agent");
    return "style_analyzer_agent";
  }
  if (content.includes("NEXT: image_planner_agent")) {
    console.log("[Router] LLM决策: image_planner_agent");
    return "image_planner_agent";
  }
  if (content.includes("NEXT: image_agent")) {
    console.log("[Router] LLM决策: image_agent");
    return "image_agent";
  }
  if (content.includes("NEXT: review_agent")) {
    console.log("[Router] LLM决策: review_agent");
    return "review_agent";
  }
  if (content.includes("NEXT: END")) {
    console.log("[Router] LLM决策: END");
    return END;
  }

  // 默认流程
  const hasReferenceImage = state.referenceImageUrl || state.referenceImages.length > 0;
  const needsResearch = !state.researchComplete;
  const needsStyle = hasReferenceImage && !state.styleAnalysis;

  console.log("[Router] 默认流程决策:");
  console.log("  - 研究完成:", state.researchComplete);
  console.log("  - 风格分析:", state.styleAnalysis ? "已分析" : "未分析");
  console.log("  - 内容完成:", state.contentComplete);
  console.log("  - 图片规划:", state.imagePlans.length > 0 ? `${state.imagePlans.length}张` : "未规划");
  console.log("  - 图片生成:", state.imagesComplete ? "已完成" : "未完成");
  console.log("  - 审核反馈:", state.reviewFeedback ? (state.reviewFeedback.approved ? "通过" : "未通过") : "未审核");

  if (needsResearch) {
    console.log("[Router] → research_agent (需要研究)");
    return "research_agent";
  }
  if (needsStyle) {
    console.log("[Router] → style_analyzer_agent (需要风格分析)");
    return "style_analyzer_agent";
  }
  if (!state.contentComplete) {
    console.log("[Router] → writer_agent (需要创作内容)");
    return "writer_agent";
  }
  if (state.imagePlans.length === 0) {
    console.log("[Router] → image_planner_agent (需要规划图片)");
    return "image_planner_agent";
  }
  if (!state.imagesComplete) {
    console.log("[Router] → image_agent (需要生成图片)");
    return "image_agent";
  }
  if (!state.reviewFeedback) {
    console.log("[Router] → review_agent (需要审核)");
    return "review_agent";
  }

  // 审核未通过：回 supervisor 重新评估，不直接使用 targetAgent
  if (state.reviewFeedback && !state.reviewFeedback.approved) {
    if (state.iterationCount >= state.maxIterations) {
      console.log("[Router] → END (达到最大迭代次数)");
      return END;
    }
    console.log("[Router] → supervisor (审核未通过，重新评估)");
    return "supervisor";  // 回 supervisor 重新评估下一步
  }

  console.log("[Router] 所有条件都不满足，准备返回 END");
  console.log("[Router] 最终状态检查:");
  console.log("  - researchComplete:", state.researchComplete);
  console.log("  - contentComplete:", state.contentComplete);
  console.log("  - imagePlans.length:", state.imagePlans.length);
  console.log("  - imagesComplete:", state.imagesComplete);
  console.log("  - reviewFeedback:", state.reviewFeedback);
  console.log("[Router] → END (所有步骤完成)");
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
    // 统一使用 image_tools 节点（动态工具在 image_agent 内部创建）
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

// review_agent 路由：approved 直接 END，否则回 supervisor
export function shouldContinueReview(state: typeof AgentState.State): string {
  if (state.reviewFeedback?.approved) {
    return END;
  }
  return "supervisor";
}

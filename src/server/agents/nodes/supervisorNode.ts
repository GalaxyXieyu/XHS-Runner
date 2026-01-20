import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages, extractState, logSupervisor } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { managePromptTool, recommendTemplatesTool } from "../tools";

export async function supervisorNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const threadId = state.threadId || "unknown";

  // 绑定 Prompt 管理工具和模板推荐工具
  const modelWithTools = model.bindTools([managePromptTool, recommendTemplatesTool]);

  const compressed = await compressContext(state, model);

  // 构建审核反馈信息
  let reviewFeedbackInfo = state.reviewFeedback
    ? state.reviewFeedback.approved
      ? "已通过"
      : `需优化: ${state.reviewFeedback.targetAgent || '未知'}\n建议: ${state.reviewFeedback.suggestions.join('; ')}`
    : "未审核";

  const stateVariables = {
    referenceImageUrl: state.referenceImageUrl ? "有" : "无",
    styleAnalysis: state.styleAnalysis ? "已完成" : "未完成",
    researchComplete: String(state.researchComplete),
    contentComplete: String(state.contentComplete),
    imagePlans: state.imagePlans.length > 0 ? `已规划${state.imagePlans.length}张` : "未规划",
    imagesComplete: state.imagesComplete ? "已完成" : "未完成",
    reviewFeedback: reviewFeedbackInfo,
    iterationCount: String(state.iterationCount),
    maxIterations: String(state.maxIterations),
    // 如果审核未通过，传递 feedback 信息供 prompt 优化使用
    needsOptimization:
      state.reviewFeedback && !state.reviewFeedback.approved && state.reviewFeedback.suggestions.length > 0
        ? "是"
        : "否",
    optimizationTarget: state.reviewFeedback?.targetAgent || "",
    optimizationSuggestions: state.reviewFeedback?.suggestions.join("\n") || "",
  };

  const systemPrompt = await getAgentPrompt("supervisor", stateVariables);
  if (!systemPrompt) {
    throw new Error("Prompt 'supervisor' not found. Please create it in Langfuse: xhs-agent-supervisor");
  }

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 5),
  ]);

  // 解析决策并记录日志
  const content = typeof response.content === "string" ? response.content : "";
  const nextMatch = content.match(/NEXT:\s*(\S+)/);
  const reasonMatch = content.match(/REASON:\s*(.+?)(?:\n|$)/);

  if (nextMatch) {
    const stateSnapshot = extractState(state);
    const next = nextMatch[1] as AgentType | "END";
    const reason = reasonMatch?.[1] || "";
    logSupervisor(threadId, stateSnapshot, next, reason);
  }

  return {
    messages: [response],
    summary: compressed.summary,
  };
}

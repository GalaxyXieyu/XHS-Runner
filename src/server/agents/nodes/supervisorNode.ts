import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state/agentState";
import {
  compressContext,
  safeSliceMessages,
  extractState,
  logSupervisor,
  parseSupervisorDecision,
  buildPreviousAgentSummary,
} from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { managePromptTool, recommendTemplatesTool, askUserTool } from "../tools";
import {
  analyzeRequirementClarity,
  buildClarificationAskUserArgs,
  extractLatestUserRequirement,
} from "../utils/requirementClarity";

export async function supervisorNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const threadId = state.threadId || "unknown";
  const clarificationRounds = state.clarificationRounds || 0;
  const latestUserRequirement = extractLatestUserRequirement(state.messages);
  const clarityReport = analyzeRequirementClarity(latestUserRequirement);

  const shouldAskClarification =
    Boolean(state.threadId)
    && !state.briefComplete
    && clarificationRounds < 1
    && !clarityReport.shouldSkipClarification
    && clarityReport.level === "low";

  if (shouldAskClarification) {
    const askArgs = buildClarificationAskUserArgs(clarityReport);

    const clarificationMessage = new AIMessage({
      content: "为了保证规划质量，先澄清关键需求。",
      tool_calls: [
        {
          id: `ask_user_${Date.now()}`,
          name: "askUser",
          args: askArgs,
          type: "tool_call",
        },
      ],
    });

    return {
      messages: [clarificationMessage],
      summary: state.summary,
      clarificationRounds: clarificationRounds + 1,
    };
  }

  const modelWithTools = model.bindTools([managePromptTool, recommendTemplatesTool, askUserTool]);
  const compressed = await compressContext(state, model);

  let reviewFeedbackInfo = state.reviewFeedback
    ? state.reviewFeedback.approved
      ? "已通过"
      : `需优化: ${state.reviewFeedback.targetAgent || "未知"}
建议: ${state.reviewFeedback.suggestions.join("; ")}`
    : "未审核";

  const previousAgent = state.currentAgent || "supervisor";
  const previousAgentSummary = buildPreviousAgentSummary(state);

  const stateVariables = {
    referenceImageUrl: state.referenceImageUrl ? "有" : "无",
    styleAnalysis: state.styleAnalysis ? "已完成" : "未完成",
    previousAgent: previousAgent,
    previousAgentSummary: previousAgentSummary,
    briefComplete: String(state.briefComplete),
    researchComplete: String(state.researchComplete),
    evidenceComplete: String(state.evidenceComplete),
    referenceIntelligenceComplete: String(state.referenceIntelligenceComplete),
    contentComplete: String(state.contentComplete),
    layoutComplete: String(state.layoutComplete),
    bodyBlocks: state.bodyBlocks.length > 0 ? `已拆分${state.bodyBlocks.length}段` : "未拆分",
    imagePlans: state.imagePlans.length > 0 ? `已规划${state.imagePlans.length}张` : "未规划",
    imagesComplete: state.imagesComplete ? "已完成" : "未完成",
    reviewFeedback: reviewFeedbackInfo,
    qualityScores: state.qualityScores ? JSON.stringify(state.qualityScores) : "无",
    lastError: state.lastError || "无",
    iterationCount: String(state.iterationCount),
    maxIterations: String(state.maxIterations),
    clarificationRounds: String(clarificationRounds),
    requirementClarityLevel: clarityReport.level,
    requirementClarityScore: clarityReport.score.toFixed(2),
    requirementMissingDimensions: clarityReport.missingDimensions.length > 0 ? clarityReport.missingDimensions.join("、") : "无",
    latestUserRequirement: clarityReport.normalizedRequirement || "无",
    userFeedback: state.userFeedback || "无",
    regenerationCount: String(state.regenerationCount || 0),
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

  // 打印 supervisor 输入到日志
  console.log("\n[supervisorNode] ========== SUPERVISOR INPUT ==========");
  console.log("[supervisorNode] stateVariables:", JSON.stringify(stateVariables, null, 2));
  console.log("[supervisorNode] systemPrompt:\n", systemPrompt);
  console.log("[supervisorNode] ==========================================\n");

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 6),
  ]);

  const hasAskUserToolCall = Boolean(
    "tool_calls" in response
    && response.tool_calls?.some((toolCall: any) => toolCall?.name === "askUser")
  );

  const content = typeof response.content === "string" ? response.content : "";
  const decision = hasAskUserToolCall ? null : parseSupervisorDecision(content);

  if (decision) {
    const stateSnapshot = extractState(state);
    const reason = decision.guidance || decision.contextFromPrevious || "";
    logSupervisor(threadId, stateSnapshot, decision.nextAgent, reason);
  }

  return {
    messages: [response],
    summary: compressed.summary,
    clarificationRounds: hasAskUserToolCall ? clarificationRounds + 1 : clarificationRounds,
    supervisorDecision: decision,
  };
}

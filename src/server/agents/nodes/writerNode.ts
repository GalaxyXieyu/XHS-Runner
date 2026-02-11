import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { parseWriterContent } from "../utils/contentParser";
import { requestAgentClarification } from "../utils/agentClarification";

export async function writerAgentNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const needEvidenceClarification = !state.evidencePack?.items?.length;
  if (needEvidenceClarification) {
    const clarificationResult = requestAgentClarification(state, {
      key: "writer_agent.evidence_gap",
      agent: "writer_agent",
      question: "当前研究证据较少，文案阶段你希望我怎么处理？",
      options: [
        { id: "continue_with_general_knowledge", label: "先按通用经验写", description: "先生成可读版本，再迭代补证据" },
        { id: "need_more_facts", label: "先补更多事实", description: "强调数据与结论，降低空泛风险" },
      ],
      selectionType: "single",
      allowCustomInput: true,
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "writer_agent" as AgentType,
        contentComplete: false,
      };
    }
  }

  const compressed = await compressContext(state, model);

  const supervisorGuidance = formatSupervisorGuidance(state, "writer_agent");

  const systemPrompt = await getAgentPrompt("writer_agent");
  if (!systemPrompt) {
    throw new Error("Prompt 'writer_agent' not found. Please create it in Langfuse: xhs-agent-writer_agent");
  }

  const briefHint = state.creativeBrief
    ? `【创作 Brief】\n受众：${state.creativeBrief.audience}\n目标：${state.creativeBrief.goal}\n核心点：${state.creativeBrief.keyPoints.join("；")}\nCTA：${state.creativeBrief.callToAction}\n禁用表达：${state.creativeBrief.bannedExpressions.join("、") || "无"}\n语气：${state.creativeBrief.tone}`
    : "";

  const evidenceHint = state.evidencePack?.items?.length
    ? `【研究证据】\n${state.evidencePack.items.map((item, idx) => `${idx + 1}. ${item.fact}${item.source ? `（来源：${item.source}）` : ""}`).join("\n")}`
    : "【研究证据】暂无结构化证据，请补充具体事实并避免空洞表达。";

  const response = await model.invoke([
    new HumanMessage(systemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    new HumanMessage(`${briefHint}\n\n${evidenceHint}`),
    ...safeSliceMessages(compressed.messages, 15),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const generatedContent = content ? parseWriterContent(content) : null;

  console.log("[writerAgentNode] 解析内容:", generatedContent?.title?.slice(0, 50));

  return {
    messages: [response],
    currentAgent: "writer_agent" as AgentType,
    contentComplete: !!generatedContent?.body,
    summary: compressed.summary,
    generatedContent,
    bodyBlocks: [], // 强制由 image_planner 使用 AI 重新拆分，确保图文映射一致
    lastError: generatedContent?.body ? null : "WRITER_EMPTY_BODY",
  };
}

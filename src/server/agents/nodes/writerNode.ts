import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { askUserTool } from "../tools";
import { parseWriterContent } from "../utils/contentParser";

export async function writerAgentNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = model.bindTools([askUserTool]);

  const compressed = await compressContext(state, model);

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

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
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

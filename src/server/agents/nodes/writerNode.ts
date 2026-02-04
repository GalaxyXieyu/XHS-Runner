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

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 15),
  ]);

  // 解析 writer 输出并保存到 state
  const content = typeof response.content === 'string' ? response.content : '';
  const generatedContent = content ? parseWriterContent(content) : null;

  console.log("[writerAgentNode] 解析内容:", generatedContent?.title?.slice(0, 50));

  return {
    messages: [response],
    currentAgent: "writer_agent" as AgentType,
    contentComplete: true,
    summary: compressed.summary,
    generatedContent, // 保存到 state，流程结束时统一入库
  };
}

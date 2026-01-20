import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { researchTools, askUserTool } from "../tools";

export async function researchAgentNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = model.bindTools([...researchTools, askUserTool]);

  const compressed = await compressContext(state, model);

  const systemPrompt = await getAgentPrompt("research_agent");
  if (!systemPrompt) {
    throw new Error("Prompt 'research_agent' not found. Please create it in Langfuse: xhs-agent-research_agent");
  }

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 10),
  ]);

  return {
    messages: [response],
    currentAgent: "research_agent" as AgentType,
    researchComplete: true,
    summary: compressed.summary,
  };
}

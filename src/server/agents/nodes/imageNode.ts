import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { imageTools, referenceImageTools } from "../tools";

export async function imageAgentNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = state.referenceImageUrl
    ? model.bindTools(referenceImageTools)
    : model.bindTools(imageTools);

  const compressed = await compressContext(state, model);

  const plans = state.imagePlans;
  const optimizedPrompts = state.reviewFeedback?.optimizedPrompts || [];
  const refImageUrl = state.referenceImageUrl || "";

  const plansWithPrompts = plans.map((p, i) => {
    const prompt = optimizedPrompts[i] || p.prompt || p.description;
    return `- 序号${p.sequence} (${p.role}): prompt="${prompt}"`;
  }).join("\n");

  const stateVariables = {
    hasReferenceImage: state.referenceImageUrl ? "true" : "false",
    plansWithPrompts,
    refImageUrl: refImageUrl.slice(0, 80),
  };

  const systemPrompt = await getAgentPrompt("image_agent", stateVariables);
  if (!systemPrompt) {
    throw new Error("Prompt 'image_agent' not found. Please create it in Langfuse: xhs-agent-image_agent");
  }

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 10),
  ]);

  return {
    messages: [response],
    currentAgent: "image_agent" as AgentType,
    reviewFeedback: null,
    summary: compressed.summary,
  };
}

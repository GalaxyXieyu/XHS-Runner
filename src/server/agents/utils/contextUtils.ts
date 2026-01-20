import { BaseMessage, HumanMessage, AIMessage, SystemMessage, RemoveMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { safeSliceMessages } from "./messageUtils";
import { AgentState } from "../state/agentState";

export const CONTEXT_COMPRESSION_CONFIG = {
  maxMessages: 15,
  keepRecentMessages: 4,
};

export async function compressContext(
  state: typeof AgentState.State,
  model: ChatOpenAI
): Promise<{ messages: BaseMessage[]; summary: string; deleteMessages?: BaseMessage[] }> {
  const { messages, summary } = state;

  if (messages.length <= CONTEXT_COMPRESSION_CONFIG.maxMessages) {
    if (summary) {
      return {
        messages: [
          new SystemMessage({ content: `【之前对话摘要】\n${summary}` }),
          ...safeSliceMessages(messages, CONTEXT_COMPRESSION_CONFIG.maxMessages),
        ],
        summary,
      };
    }
    return { messages: safeSliceMessages(messages, CONTEXT_COMPRESSION_CONFIG.maxMessages), summary };
  }

  const summaryPrompt = summary
    ? `这是之前的对话摘要：\n${summary}\n\n请根据以下新消息扩展摘要，保留关键信息（研究结果、创作内容、风格分析、图片规划等）：`
    : `请总结以下对话的关键信息，包括：研究发现、创作内容、风格分析结果、图片规划等：`;

  const messagesToSummarize = messages.slice(0, -CONTEXT_COMPRESSION_CONFIG.keepRecentMessages);
  const recentMessages = messages.slice(-CONTEXT_COMPRESSION_CONFIG.keepRecentMessages);

  try {
    const response = await model.invoke([
      new HumanMessage({
        content: `${summaryPrompt}\n\n${messagesToSummarize.map(m => {
          const role = m instanceof HumanMessage ? "用户" : m instanceof AIMessage ? "助手" : "工具";
          const content = typeof m.content === "string" ? m.content.slice(0, 500) : "[复杂内容]";
          return `[${role}]: ${content}`;
        }).join("\n\n")}`
      }),
    ]);

    const newSummary = typeof response.content === "string" ? response.content : summary;

    return {
      messages: [
        new SystemMessage({ content: `【之前对话摘要】\n${newSummary}` }),
        ...safeSliceMessages(recentMessages, CONTEXT_COMPRESSION_CONFIG.keepRecentMessages),
      ],
      summary: newSummary,
      deleteMessages: messagesToSummarize.map(m => new RemoveMessage({ id: m.id })),
    };
  } catch (error) {
    console.error("[compressContext] Failed to generate summary:", error);
    return {
      messages: safeSliceMessages(messages, CONTEXT_COMPRESSION_CONFIG.maxMessages),
      summary,
    };
  }
}

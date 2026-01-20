import { BaseMessage, AIMessage, ToolMessage, HumanMessage } from "@langchain/core/messages";

// 过滤掉不完整的工具调用对
export function filterOrphanedToolMessages(messages: BaseMessage[]): BaseMessage[] {
  const toolResponseIds = new Set<string>();
  for (const msg of messages) {
    if (msg instanceof ToolMessage) {
      const toolCallId = (msg as any).tool_call_id;
      if (toolCallId) toolResponseIds.add(toolCallId);
    }
  }

  const result: BaseMessage[] = [];
  const pendingToolCallIds = new Set<string>();

  for (const msg of messages) {
    if (msg instanceof AIMessage && msg.tool_calls?.length) {
      const toolCallIds = msg.tool_calls.map(tc => tc.id).filter(Boolean);
      const missingIds = toolCallIds.filter(id => !toolResponseIds.has(id!));

      if (missingIds.length === 0) {
        for (const tc of msg.tool_calls) {
          if (tc.id) pendingToolCallIds.add(tc.id);
        }
        result.push(msg);
      }
    } else if (msg instanceof ToolMessage) {
      const toolCallId = (msg as any).tool_call_id;
      if (toolCallId && pendingToolCallIds.has(toolCallId)) {
        result.push(msg);
        pendingToolCallIds.delete(toolCallId);
      }
    } else {
      result.push(msg);
    }
  }

  return result;
}

// 安全截取消息，确保不会截断工具调用对
export function safeSliceMessages(messages: BaseMessage[], maxCount: number): BaseMessage[] {
  const filtered = filterOrphanedToolMessages(messages);
  if (filtered.length <= maxCount) {
    return filtered;
  }

  let startIndex = filtered.length - maxCount;
  while (startIndex < filtered.length && filtered[startIndex] instanceof ToolMessage) {
    startIndex--;
  }
  if (startIndex < 0) startIndex = 0;

  const sliced = filtered.slice(startIndex);
  return filterOrphanedToolMessages(sliced);
}

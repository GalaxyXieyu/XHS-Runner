import { Command } from "@langchain/langgraph";
import { buildGraph, type HITLConfig } from "./graph";
import { getCheckpointer, createLLM } from "./utils";
import { AgentState } from "./state/agentState";
import type { UserResponse } from "./tools/askUserTool";

// Re-export types and interfaces
export type { HITLConfig } from "./graph";
export {
  AgentState,
} from "./state/agentState";
export type {
  AgentEvent,
  StyleAnalysis,
  ImagePlan,
  ReviewFeedback,
  PendingConfirmation,
  AgentType,
} from "./state/agentState";

// 恢复工作流执行（用于 HITL 确认后）
export async function resumeWorkflow(
  threadId: string,
  modifiedStateOrUserResponse?: Partial<typeof AgentState.State> | UserResponse,
  userFeedback?: string
) {
  const checkpointer = await getCheckpointer();
  const config = { configurable: { thread_id: threadId } };

  const checkpoint = await checkpointer.get(config);
  if (!checkpoint) {
    throw new Error(`No checkpoint found for thread: ${threadId}`);
  }

  const app = await createMultiAgentSystem({ enableHITL: true, threadId });

  // 检查是否是 askUser 响应
  const isUserResponse = modifiedStateOrUserResponse &&
    ("selectedIds" in modifiedStateOrUserResponse || "customInput" in modifiedStateOrUserResponse);

  if (isUserResponse) {
    return app.stream(new Command({ resume: modifiedStateOrUserResponse }), config);
  }

  // 构建更新状态 (传统 HITL 模式)
  const updateState: Record<string, unknown> = {
    pendingConfirmation: null,
  };

  if (userFeedback) {
    updateState.userFeedback = userFeedback;
    const currentCount = (checkpoint.channel_values?.regenerationCount as number) || 0;
    updateState.regenerationCount = currentCount + 1;
  }

  if (modifiedStateOrUserResponse && !isUserResponse) {
    Object.assign(updateState, modifiedStateOrUserResponse);
  }

  console.log("[resumeWorkflow] 恢复工作流, updateState:", updateState);

  // 重要：LangGraph 的 interruptAfter 要求传递 null 来从中断点恢复
  // 如果需要更新状态，应该先更新状态，然后传递 null 来恢复执行
  // 但是目前 LangGraph 不支持在恢复时同时更新状态，所以我们直接传递 null
  // TODO: 如果需要在恢复时更新状态，需要使用其他方法
  return app.stream(null, config);
}

// 创建多 Agent 系统
export async function createMultiAgentSystem(hitlConfig?: HITLConfig) {
  const model = await createLLM();
  return buildGraph(model, hitlConfig);
}

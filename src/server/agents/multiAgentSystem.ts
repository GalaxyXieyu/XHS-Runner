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
    return app.stream(new Command({ resume: modifiedStateOrUserResponse }), { ...config, streamMode: ["updates", "tasks"] as any });
  }

  // 组装需要写回的状态
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

  // 在恢复前显式更新状态，修复“修改后继续”丢失的问题
  if (Object.keys(updateState).length > 0) {
    await app.updateState(config, updateState, "supervisor");
  }

  console.log("[resumeWorkflow] 恢复工作流, updateState:", updateState);
  return app.stream(null, { ...config, streamMode: ["updates", "tasks"] as any });
}

// 创建多 Agent 系统
export async function createMultiAgentSystem(hitlConfig?: HITLConfig) {
  const model = await createLLM();
  return buildGraph(model, hitlConfig);
}

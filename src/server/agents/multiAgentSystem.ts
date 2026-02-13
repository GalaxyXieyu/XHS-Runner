import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
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

  const currentAgent = checkpoint.channel_values?.currentAgent as string || "writer_agent";
  const isFastMode = Boolean(checkpoint.channel_values?.fastMode);

  const app = await createMultiAgentSystem({ enableHITL: true, threadId });

  // 检查是否是 askUser 响应
  const isUserResponse = modifiedStateOrUserResponse &&
    ("selectedIds" in modifiedStateOrUserResponse || "customInput" in modifiedStateOrUserResponse);

  if (isUserResponse) {
    return app.stream(new Command({ resume: modifiedStateOrUserResponse }), { ...config, recursionLimit: 100, streamMode: ["updates", "tasks"] as any });
  }

  // 组装需要写回的状态
  const updateState: Record<string, unknown> = {
    pendingConfirmation: null,
  };

  if (userFeedback) {
    // 用户 reject，带反馈重新生成
    updateState.userFeedback = userFeedback;
    const currentCount = (checkpoint.channel_values?.regenerationCount as number) || 0;
    updateState.regenerationCount = currentCount + 1;
    if (isFastMode) {
      updateState.messages = [new HumanMessage(`【用户反馈】${userFeedback}`)];
      if (currentAgent === "writer_agent") {
        updateState.contentComplete = false;
        updateState.generatedContent = null;
        updateState.layoutComplete = false;
        updateState.layoutSpec = [];
        updateState.imagePlans = [];
        updateState.textOverlayPlan = [];
        updateState.bodyBlocks = [];
        updateState.paragraphImageBindings = [];
        updateState.imagesComplete = false;
      } else if (currentAgent === "image_planner_agent") {
        updateState.imagePlans = [];
        updateState.textOverlayPlan = [];
        updateState.bodyBlocks = [];
        updateState.paragraphImageBindings = [];
        updateState.imagesComplete = false;
      }
    }
  } else {
    // 用户 approve/modify 时，写入确认信息，告诉 supervisor 用户已确认当前阶段
    const previousAgent = checkpoint.channel_values?.currentAgent as string || "当前阶段";
    updateState.userFeedback = `用户已确认 ${previousAgent} 的输出，请继续下一步，不要回退`;
  }

  if (modifiedStateOrUserResponse && !isUserResponse) {
    Object.assign(updateState, modifiedStateOrUserResponse);
  }

  // 在恢复前显式更新状态，修复"修改后继续"丢失的问题
  // 使用当前暂停的节点作为 as_node，这样恢复时会重新执行 supervisor
  if (Object.keys(updateState).length > 0) {
    await app.updateState(config, updateState, currentAgent);
  }

  console.log("[resumeWorkflow] 恢复工作流, updateState:", updateState);
  return app.stream(null, { ...config, recursionLimit: 100, streamMode: ["updates", "tasks"] as any });
}

// 创建多 Agent 系统
export async function createMultiAgentSystem(hitlConfig?: HITLConfig) {
  const model = await createLLM(false, {
    sessionId: hitlConfig?.langfuseSessionId || hitlConfig?.threadId,
    tags: hitlConfig?.langfuseTags,
  });
  return buildGraph(model, hitlConfig);
}

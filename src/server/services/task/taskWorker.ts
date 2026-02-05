import { HumanMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { createMultiAgentSystem, resumeWorkflow } from '@/server/agents/multiAgentSystem';
import { processAgentStream } from '@/server/agents/utils/streamProcessor';
import type { UserResponse } from '@/server/agents/tools/askUserTool';
import type { TaskEventEnvelope, TaskEventPayload } from './types';
import { appendTaskEvent, getNextEventIndex } from './taskEventStore';
import { publishTaskEvent } from './taskPubSub';
import { addDatasetItem, createTrace, flushLangfuse } from '@/server/services/langfuseService';

type TaskMetadata = {
  referenceImages?: string[];
  imageGenProvider?: string;
  enableHITL?: boolean;
  sourceTaskId?: number;
};

type ResumeOptions = {
  userResponse?: UserResponse;
  userFeedback?: string;
};

function normalizeMetadata(metadata: unknown): TaskMetadata {
  if (metadata && typeof metadata === 'object') {
    return metadata as TaskMetadata;
  }
  return {};
}

function resolveReferenceImages(metadata: TaskMetadata, referenceImageUrl?: string | null) {
  const images = Array.isArray(metadata.referenceImages) ? metadata.referenceImages.filter(Boolean) : [];
  if (images.length === 0 && referenceImageUrl) {
    return [referenceImageUrl];
  }
  return images;
}

function resolveProgress(event: TaskEventPayload): number | null {
  const rawProgress = (event as any).progress;
  if (typeof rawProgress === 'number' && Number.isFinite(rawProgress)) {
    return Math.max(0, Math.min(100, Math.round(rawProgress)));
  }
  if (event.type === 'workflow_complete') {
    return 100;
  }
  return null;
}

function extractHitlData(event: TaskEventPayload) {
  if (event.type !== 'ask_user') return null;
  return {
    question: (event as any).question,
    options: (event as any).options,
    selectionType: (event as any).selectionType,
    allowCustomInput: (event as any).allowCustomInput,
    context: (event as any).context,
  };
}

async function updateTask(taskId: number, updates: Record<string, unknown>) {
  await db
    .update(schema.generationTasks)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(schema.generationTasks.id, taskId));
}

async function updateTaskFromEvent(taskId: number, event: TaskEventPayload) {
  const updates: Record<string, unknown> = {};
  let hasUpdates = false;

  if (event.type === 'agent_start' && (event as any).agent) {
    updates.currentAgent = (event as any).agent;
    hasUpdates = true;
  }

  const progress = resolveProgress(event);
  if (progress !== null) {
    updates.progress = progress;
    hasUpdates = true;
  }

  if (event.type === 'workflow_complete') {
    updates.status = 'completed';
    updates.finishedAt = new Date();
    updates.progress = 100;
    updates.result = {
      creativeId: (event as any).creativeId,
      imageAssetIds: (event as any).imageAssetIds,
      title: (event as any).title,
      body: (event as any).body,
      tags: (event as any).tags,
    };
    updates.errorMessage = null;
    hasUpdates = true;
  }

  if (hasUpdates) {
    await updateTask(taskId, updates);
  }
}

async function recordFailureEvent(taskId: number, message: string) {
  const eventIndex = await getNextEventIndex(taskId);
  const event: TaskEventPayload = {
    type: 'workflow_failed',
    content: message,
    timestamp: Date.now(),
  };
  const envelope: TaskEventEnvelope = { ...event, eventIndex } as TaskEventEnvelope;

  await appendTaskEvent(taskId, eventIndex, event);
  await publishTaskEvent(taskId, envelope);
}

async function processStream(
  taskId: number,
  stream: AsyncIterable<any>,
  options: {
    themeId?: number | null;
    creativeId?: number | null;
    enableHITL?: boolean;
    threadId?: string | null;
    traceId?: string;
  }
) {
  let eventIndex = await getNextEventIndex(taskId);
  let paused = false;
  let workflowCompleted = false;
  let finalCreativeId: number | null = options.creativeId ?? null;

  const onCreativeCreated = async (creativeId: number) => {
    finalCreativeId = creativeId;
    await updateTask(taskId, { creativeId });
  };

  // 用于收集所有 agent 的输出
  const agentInputs = new Map<string, any>();
  const agentOutputs = new Map<string, any>();

  for await (const event of processAgentStream(stream, {
    themeId: options.themeId ?? undefined,
    creativeId: options.creativeId ?? undefined,
    enableHITL: options.enableHITL,
    threadId: options.threadId ?? undefined,
    onCreativeCreated,
    traceId: options.traceId,
  })) {
    const payload = event as TaskEventPayload;
    const envelope: TaskEventEnvelope = { ...payload, eventIndex } as TaskEventEnvelope;

    await appendTaskEvent(taskId, eventIndex, payload);
    await publishTaskEvent(taskId, envelope);
    await updateTaskFromEvent(taskId, payload);

    // 记录 agent 输入
    if (payload.type === 'agent_start' && payload.agent) {
      agentInputs.set(payload.agent, {
        state: payload.state,
        message: payload.message,
      });
    }

    // 收集 agent 输出（不立即记录到 dataset）
    if (payload.type === 'agent_end' && payload.agent && payload.agent !== 'supervisor_route') {
      const agentOutput = payload.output || payload.content;
      agentOutputs.set(payload.agent, agentOutput);
    }

    // 标记工作流完成
    if (payload.type === 'workflow_complete') {
      workflowCompleted = true;
    }

    if (payload.type === 'ask_user') {
      paused = true;
      await updateTask(taskId, {
        status: 'paused',
        hitlStatus: 'pending',
        hitlData: extractHitlData(payload),
      });
    }

    eventIndex += 1;
  }

  // 只有在流程成功完成且有 creativeId 时，才记录到 dataset
  if (workflowCompleted && finalCreativeId && !paused) {
    console.log(`[taskWorker] Workflow completed successfully, recording to dataset. creativeId: ${finalCreativeId}`);

    // 批量记录所有 agent 输出到 dataset
    for (const [agentName, output] of agentOutputs.entries()) {
      const input = agentInputs.get(agentName) || { themeId: options.themeId };

      void addDatasetItem({
        agentName,
        input,
        output,
        traceId: options.traceId,
        metadata: {
          themeId: options.themeId,
          creativeId: finalCreativeId,
          timestamp: new Date().toISOString(),
          agent: agentName,
          workflowCompleted: true,
        },
      }).catch((error) => {
        console.error(`[taskWorker] Failed to record dataset item for ${agentName}:`, error);
      });
    }
  } else {
    if (!workflowCompleted) {
      console.log(`[taskWorker] Workflow did not complete successfully, skipping dataset recording`);
    } else if (!finalCreativeId) {
      console.log(`[taskWorker] No creativeId created, skipping dataset recording`);
    } else if (paused) {
      console.log(`[taskWorker] Workflow paused (HITL), skipping dataset recording`);
    }
  }

  // 刷新 Langfuse
  if (options.traceId) {
    await flushLangfuse();
  }

  if (!paused) {
    await updateTask(taskId, {
      status: 'completed',
      progress: 100,
      finishedAt: new Date(),
    });
  }
}

export async function executeTask(taskId: number) {
  const [task] = await db
    .select()
    .from(schema.generationTasks)
    .where(eq(schema.generationTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (!task.prompt) {
    throw new Error(`Task ${taskId} has no prompt`);
  }

  const metadata = normalizeMetadata(task.metadata);
  const referenceImages = resolveReferenceImages(metadata, task.referenceImageUrl);
  const enableHITL = Boolean(metadata.enableHITL || task.threadId);

  await updateTask(taskId, {
    status: 'running',
    startedAt: task.startedAt ?? new Date(),
    progress: task.progress ?? 0,
  });

  const app = await createMultiAgentSystem({
    enableHITL,
    threadId: task.threadId ?? undefined,
  });

  const initialState: any = {
    messages: [new HumanMessage(task.prompt)],
    themeId: task.themeId ?? undefined,
    creativeId: task.creativeId ?? undefined,
    referenceImages,
    referenceImageUrl: referenceImages[0] || null,
    imageGenProvider: metadata.imageGenProvider,
    threadId: task.threadId ?? undefined,
  };

  const streamConfig: any = { recursionLimit: 100 };
  if (task.threadId) {
    streamConfig.configurable = { thread_id: task.threadId };
  }

  // 创建 Langfuse trace
  const trace = await createTrace('task-execution', {
    taskId,
    themeId: task.themeId,
    creativeId: task.creativeId,
    enableHITL,
    referenceImageCount: referenceImages.length,
  });
  const traceId = trace?.id;

  const stream = await app.stream(initialState, streamConfig as any);

  try {
    await processStream(taskId, stream, {
      themeId: task.themeId,
      creativeId: task.creativeId,
      enableHITL,
      threadId: task.threadId,
      traceId,
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    await recordFailureEvent(taskId, message);
    await updateTask(taskId, {
      status: 'failed',
      errorMessage: message,
      finishedAt: new Date(),
    });
    throw error;
  }
}

export async function resumeTask(taskId: number, options: ResumeOptions) {
  const [task] = await db
    .select()
    .from(schema.generationTasks)
    .where(eq(schema.generationTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (!task.threadId) {
    throw new Error(`Task ${taskId} has no threadId to resume`);
  }

  const metadata = normalizeMetadata(task.metadata);
  const enableHITL = Boolean(metadata.enableHITL || task.threadId);

  await updateTask(taskId, {
    status: 'running',
    hitlStatus: 'responded',
  });

  // 创建 Langfuse trace（恢复任务时）
  const trace = await createTrace('task-resume', {
    taskId,
    threadId: task.threadId,
    resumed: true,
  });
  const traceId = trace?.id;

  const stream = await resumeWorkflow(task.threadId, options.userResponse, options.userFeedback);

  try {
    await processStream(taskId, stream, {
      themeId: task.themeId,
      creativeId: task.creativeId,
      enableHITL,
      threadId: task.threadId,
      traceId,
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    await recordFailureEvent(taskId, message);
    await updateTask(taskId, {
      status: 'failed',
      errorMessage: message,
      finishedAt: new Date(),
    });
    throw error;
  }
}

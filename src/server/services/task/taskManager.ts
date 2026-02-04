import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { UserResponse } from '@/server/agents/tools/askUserTool';
import { executeTask, resumeTask } from './taskWorker';
import { getTaskEventCount, getTaskEvents } from './taskEventStore';
import type { TaskHitlResponse, TaskStatusResponse, TaskSubmitPayload } from './types';

function normalizeHitlResponse(response: TaskHitlResponse): UserResponse {
  const selectedIds = response.selectedIds || (response.action ? [response.action] : undefined);
  const userResponse: UserResponse = {};
  if (selectedIds) userResponse.selectedIds = selectedIds;
  if (response.customInput) userResponse.customInput = response.customInput;
  if (response.modifiedData) userResponse.modifiedContext = response.modifiedData;
  return userResponse;
}

function isManualHitl(hitlData: unknown): boolean {
  if (!hitlData || typeof hitlData !== 'object') return false;
  const context = (hitlData as any).context;
  return Boolean(context && typeof context === 'object' && (context as any).__hitl);
}

export class TaskManager {
  async submitTask(payload: TaskSubmitPayload) {
    const enableHITL = Boolean(payload.enableHITL);
    const threadId = enableHITL ? uuidv4() : null;
    const referenceImages = payload.referenceImages || [];

    const metadata = {
      enableHITL,
      referenceImages,
      imageGenProvider: payload.imageGenProvider,
      sourceTaskId: payload.sourceTaskId,
    };

    const [task] = await db
      .insert(schema.generationTasks)
      .values({
        themeId: payload.themeId,
        status: 'queued',
        prompt: payload.message,
        model: 'agent',
        threadId,
        hitlStatus: 'none',
        progress: 0,
        metadata,
        referenceImageUrl: referenceImages[0] || null,
      })
      .returning({ id: schema.generationTasks.id });

    const taskId = task.id;

    void executeTask(taskId).catch((error) => {
      console.error('[TaskManager] executeTask failed:', error);
    });

    return {
      taskId,
      threadId: threadId || undefined,
      status: 'queued' as const,
    };
  }

  async getTaskStatus(taskId: number): Promise<TaskStatusResponse | null> {
    const [task] = await db
      .select({
        id: schema.generationTasks.id,
        status: schema.generationTasks.status,
        progress: schema.generationTasks.progress,
        currentAgent: schema.generationTasks.currentAgent,
        hitlStatus: schema.generationTasks.hitlStatus,
        hitlData: schema.generationTasks.hitlData,
        creativeId: schema.generationTasks.creativeId,
        errorMessage: schema.generationTasks.errorMessage,
        createdAt: schema.generationTasks.createdAt,
        updatedAt: schema.generationTasks.updatedAt,
        threadId: schema.generationTasks.threadId,
      })
      .from(schema.generationTasks)
      .where(eq(schema.generationTasks.id, taskId))
      .limit(1);

    if (!task) return null;

    const eventCount = await getTaskEventCount(taskId);

    return {
      id: task.id,
      status: task.status as TaskStatusResponse['status'],
      progress: task.progress ?? 0,
      currentAgent: task.currentAgent ?? null,
      hitlStatus: task.hitlStatus ?? null,
      hitlData: (task.hitlData as any) ?? null,
      creativeId: task.creativeId ?? null,
      errorMessage: task.errorMessage ?? null,
      eventCount,
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: task.updatedAt?.toISOString() || new Date().toISOString(),
      threadId: task.threadId ?? null,
    };
  }

  async getTaskEvents(taskId: number, fromIndex = 0) {
    return getTaskEvents(taskId, fromIndex);
  }

  async respondToTask(taskId: number, response: TaskHitlResponse) {
    const [task] = await db
      .select({
        id: schema.generationTasks.id,
        status: schema.generationTasks.status,
        threadId: schema.generationTasks.threadId,
        hitlData: schema.generationTasks.hitlData,
      })
      .from(schema.generationTasks)
      .where(eq(schema.generationTasks.id, taskId))
      .limit(1);

    if (!task) {
      throw new Error('Task not found');
    }

    if (!task.threadId) {
      throw new Error('Task does not support HITL');
    }

    await db
      .update(schema.generationTasks)
      .set({
        status: 'running',
        hitlStatus: 'responded',
        hitlResponse: response,
        updatedAt: new Date(),
      })
      .where(eq(schema.generationTasks.id, taskId));

    const manualHitl = isManualHitl(task.hitlData as any);
    const userResponse = manualHitl ? undefined : normalizeHitlResponse(response);
    const userFeedback = manualHitl && response.action === 'reject' ? response.customInput : undefined;

    void resumeTask(taskId, {
      userResponse,
      userFeedback,
    }).catch((error) => {
      console.error('[TaskManager] resumeTask failed:', error);
    });

    return { status: 'running' as const };
  }
}

export const taskManager = new TaskManager();

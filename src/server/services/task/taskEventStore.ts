import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { TaskEventEnvelope, TaskEventPayload } from './types';

function normalizeEvent(row: { eventIndex: number; eventType: string; eventData: any }): TaskEventEnvelope {
  const data = row.eventData && typeof row.eventData === 'object' ? row.eventData : {};
  return {
    eventIndex: row.eventIndex,
    type: row.eventType,
    ...data,
  } as TaskEventEnvelope;
}

export async function appendTaskEvent(taskId: number, eventIndex: number, event: TaskEventPayload) {
  await db
    .insert(schema.taskEvents)
    .values({
      taskId,
      eventIndex,
      eventType: event.type,
      eventData: event as any,
    })
    .onConflictDoNothing();
}

export async function getTaskEvents(taskId: number, fromIndex = 0): Promise<TaskEventEnvelope[]> {
  const rows = await db
    .select({
      eventIndex: schema.taskEvents.eventIndex,
      eventType: schema.taskEvents.eventType,
      eventData: schema.taskEvents.eventData,
    })
    .from(schema.taskEvents)
    .where(and(eq(schema.taskEvents.taskId, taskId), gte(schema.taskEvents.eventIndex, fromIndex)))
    .orderBy(asc(schema.taskEvents.eventIndex));

  return rows.map((row) => normalizeEvent(row));
}

export async function getTaskEventCount(taskId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.taskEvents)
    .where(eq(schema.taskEvents.taskId, taskId));
  return Number(rows[0]?.count || 0);
}

export async function getNextEventIndex(taskId: number): Promise<number> {
  const rows = await db
    .select({ maxIndex: sql<number>`max(${schema.taskEvents.eventIndex})` })
    .from(schema.taskEvents)
    .where(eq(schema.taskEvents.taskId, taskId));

  const maxIndex = rows[0]?.maxIndex;
  if (maxIndex === null || maxIndex === undefined) {
    return 0;
  }
  return Number(maxIndex) + 1;
}

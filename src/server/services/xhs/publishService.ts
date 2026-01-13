// Publish Service - Drizzle ORM
import { db, schema } from '../../db/index';
import { desc, eq } from 'drizzle-orm';
import type { PublishRecord } from '../../db/schema';

export type { PublishRecord };

export async function enqueuePublish(payload: {
  accountId?: number;
  themeId?: number;
  creativeId?: number;
  noteId?: string;
  xsecToken?: string;
  type?: string;
  title?: string;
  content?: string;
  tags?: string;
  mediaUrls?: string;
  scheduledAt?: Date;
}): Promise<PublishRecord> {
  const [record] = await db
    .insert(schema.publishRecords)
    .values({
      accountId: payload.accountId ?? null,
      themeId: payload.themeId ?? null,
      creativeId: payload.creativeId ?? null,
      noteId: payload.noteId ?? null,
      xsecToken: payload.xsecToken ?? null,
      type: payload.type ?? null,
      title: payload.title ?? null,
      content: payload.content ?? null,
      tags: payload.tags ?? null,
      mediaUrls: payload.mediaUrls ?? null,
      status: 'queued',
      scheduledAt: payload.scheduledAt ?? null,
    })
    .returning();

  return record;
}

export async function listPublishes(themeId?: number) {
  if (themeId !== undefined) {
    return db
      .select()
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.themeId, themeId))
      .orderBy(desc(schema.publishRecords.id));
  }

  return db
    .select()
    .from(schema.publishRecords)
    .orderBy(desc(schema.publishRecords.id));
}

export async function updatePublishStatus(
  id: number,
  data: {
    status?: string;
    noteId?: string;
    publishedAt?: Date;
    response?: Record<string, unknown>;
    errorMessage?: string;
  }
): Promise<PublishRecord> {
  const [record] = await db
    .update(schema.publishRecords)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(schema.publishRecords.id, id))
    .returning();

  if (!record) {
    throw new Error('Publish record not found');
  }

  return record;
}

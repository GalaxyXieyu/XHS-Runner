import { db, schema } from '../../../db/index';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PublishRecord } from '../../../db/schema';
import { publishContent as publishContentLocal } from '../integration/localService';

export type PublishExecutor = (payload: {
  type?: string | null;
  title: string;
  content: string;
  mediaPaths: string[];
  tags?: string | null;
}) => Promise<{ success: boolean; noteId?: string; raw?: any; message?: string }>;

type PublishProcessResult =
  | { processed: false; reason: 'empty' | 'not-found' | 'not-eligible'; status?: string | null }
  | { processed: true; recordId: number; success: boolean; noteId?: string; errorMessage?: string };

function splitMediaUrls(mediaUrls: unknown): string[] {
  if (!mediaUrls) return [];
  const raw = String(mediaUrls);
  return raw
    .split(/\s*,\s*|\s+\n\s+|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertPublishable(record: PublishRecord) {
  if (!record.title || !String(record.title).trim()) {
    throw new Error('publish_records: missing title');
  }
  if (!record.content || !String(record.content).trim()) {
    throw new Error('publish_records: missing content');
  }
  const mediaPaths = splitMediaUrls(record.mediaUrls);
  if (mediaPaths.length === 0) {
    throw new Error('publish_records: missing mediaUrls');
  }
  return {
    type: record.type,
    title: String(record.title),
    content: String(record.content),
    tags: record.tags,
    mediaPaths,
  };
}

async function executePublishRecord(
  record: PublishRecord,
  executor: PublishExecutor
): Promise<PublishProcessResult> {
  const recordId = Number((record as any).id);

  try {
    const payload = assertPublishable(record as any);
    const result = await executor(payload);

    await db
      .update(schema.publishRecords)
      .set({
        status: result.success ? 'published' : 'failed',
        noteId: result.noteId || null,
        publishedAt: result.success ? new Date() : null,
        response: (result as any).raw || null,
        errorMessage: result.success ? null : (result.message || 'publish failed'),
        updatedAt: new Date(),
      })
      .where(eq(schema.publishRecords.id, recordId));

    return { processed: true, recordId, success: result.success, noteId: result.noteId };
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    await db
      .update(schema.publishRecords)
      .set({ status: 'failed', errorMessage: msg, updatedAt: new Date() })
      .where(eq(schema.publishRecords.id, recordId));

    return { processed: true, recordId, success: false, errorMessage: msg };
  }
}

export async function processNextPublishRecord(options?: {
  executor?: PublishExecutor;
}): Promise<PublishProcessResult> {
  const executor: PublishExecutor =
    options?.executor ||
    (async ({ type, title, content, mediaPaths, tags }) => {
      const raw = await publishContentLocal({
        type: type || 'image',
        title,
        content,
        media_paths: mediaPaths,
        tags: tags || '',
      });

      // Best-effort normalization across drivers.
      const noteId = (raw as any)?.noteId || (raw as any)?.note_id || (raw as any)?.data?.noteId;
      const ok = (raw as any)?.success !== false;
      return { success: ok, noteId, raw };
    });

  // Atomic claim with SKIP LOCKED to avoid concurrent workers racing on the same row.
  const [locked] = await db
    .update(schema.publishRecords)
    .set({ status: 'running', updatedAt: new Date() })
    .where(sql`${schema.publishRecords.id} = (
      SELECT ${schema.publishRecords.id}
      FROM ${schema.publishRecords}
      WHERE ${schema.publishRecords.status} = 'queued'
      ORDER BY ${schema.publishRecords.id} ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )`)
    .returning();

  if (!locked) return { processed: false, reason: 'empty' };

  return executePublishRecord(locked as PublishRecord, executor);
}

export async function processPublishRecordById(
  recordId: number,
  options?: { executor?: PublishExecutor }
): Promise<PublishProcessResult> {
  const executor: PublishExecutor =
    options?.executor ||
    (async ({ type, title, content, mediaPaths, tags }) => {
      const raw = await publishContentLocal({
        type: type || 'image',
        title,
        content,
        media_paths: mediaPaths,
        tags: tags || '',
      });

      const noteId = (raw as any)?.noteId || (raw as any)?.note_id || (raw as any)?.data?.noteId;
      const ok = (raw as any)?.success !== false;
      return { success: ok, noteId, raw };
    });

  const [locked] = await db
    .update(schema.publishRecords)
    .set({ status: 'running', updatedAt: new Date() })
    .where(
      and(
        eq(schema.publishRecords.id, recordId),
        inArray(schema.publishRecords.status, ['queued', 'pending', 'failed'])
      )
    )
    .returning();

  if (!locked) {
    const [current] = await db
      .select({ status: schema.publishRecords.status })
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.id, recordId))
      .limit(1);

    if (!current) return { processed: false, reason: 'not-found' };
    return { processed: false, reason: 'not-eligible', status: current.status };
  }

  return executePublishRecord(locked as PublishRecord, executor);
}

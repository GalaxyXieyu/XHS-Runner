import { db, schema } from '../../../db/index';
import { asc, eq } from 'drizzle-orm';
import type { PublishRecord } from '../../../db/schema';
import { publishContent as publishContentLocal } from '../integration/localService';

export type PublishExecutor = (payload: {
  type?: string | null;
  title: string;
  content: string;
  mediaPaths: string[];
  tags?: string | null;
}) => Promise<{ success: boolean; noteId?: string; raw?: any; message?: string }>;

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

export async function processNextPublishRecord(options?: {
  executor?: PublishExecutor;
}): Promise<
  | { processed: false; reason: 'empty' }
  | { processed: true; recordId: number; success: boolean; noteId?: string; errorMessage?: string }
> {
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

  // No transaction/lock here; we keep it minimal. If concurrency becomes a problem,
  // we can add an atomic UPDATE ... WHERE status='queued' RETURNING pattern.
  const [next] = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.status, 'queued'))
    .orderBy(asc(schema.publishRecords.id))
    .limit(1);

  if (!next) return { processed: false, reason: 'empty' };

  const recordId = Number((next as any).id);
  await db
    .update(schema.publishRecords)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(schema.publishRecords.id, recordId));

  try {
    const payload = assertPublishable(next as any);
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

// Creative Service - Drizzle ORM
import { db, schema } from '../../db/index';
import { desc, eq } from 'drizzle-orm';
import type { Creative, NewCreative } from '../../db/schema';

export type { Creative, NewCreative };

export async function listCreatives(themeId?: number) {
  if (themeId !== undefined) {
    return db
      .select()
      .from(schema.creatives)
      .where(eq(schema.creatives.themeId, themeId))
      .orderBy(desc(schema.creatives.id));
  }

  return db
    .select()
    .from(schema.creatives)
    .orderBy(desc(schema.creatives.id));
}

export async function createCreative(payload: {
  themeId?: number;
  sourceTopicId?: number;
  sourceTopicIds?: string;
  title?: string;
  content?: string;
  script?: string;
  tags?: string;
  coverStyle?: string;
  coverPrompt?: string;
  rationale?: Record<string, unknown>;
  status?: string;
  model?: string;
  prompt?: string;
}): Promise<Creative> {
  const [result] = await db
    .insert(schema.creatives)
    .values({
      themeId: payload.themeId ?? null,
      sourceTopicId: payload.sourceTopicId ?? null,
      sourceTopicIds: payload.sourceTopicIds ?? null,
      title: payload.title ?? null,
      content: payload.content ?? null,
      script: payload.script ?? null,
      tags: payload.tags ?? null,
      coverStyle: payload.coverStyle ?? null,
      coverPrompt: payload.coverPrompt ?? null,
      rationale: payload.rationale ?? null,
      status: payload.status ?? 'draft',
      model: payload.model ?? null,
      prompt: payload.prompt ?? null,
    })
    .returning();

  return result;
}

export async function updateCreative(payload: {
  id: number;
  themeId?: number;
  sourceTopicId?: number;
  sourceTopicIds?: string;
  title?: string;
  content?: string;
  script?: string;
  tags?: string;
  coverStyle?: string;
  coverPrompt?: string;
  rationale?: Record<string, unknown>;
  status?: string;
  model?: string;
  prompt?: string;
}): Promise<Creative> {
  if (!payload.id) {
    throw new Error('creatives:update requires id');
  }

  const updateData: Partial<NewCreative> = { updatedAt: new Date() };
  if (payload.themeId !== undefined) updateData.themeId = payload.themeId ?? null;
  if (payload.sourceTopicId !== undefined) updateData.sourceTopicId = payload.sourceTopicId ?? null;
  if (payload.sourceTopicIds !== undefined) updateData.sourceTopicIds = payload.sourceTopicIds ?? null;
  if (payload.title !== undefined) updateData.title = payload.title ?? null;
  if (payload.content !== undefined) updateData.content = payload.content ?? null;
  if (payload.script !== undefined) updateData.script = payload.script ?? null;
  if (payload.tags !== undefined) updateData.tags = payload.tags ?? null;
  if (payload.coverStyle !== undefined) updateData.coverStyle = payload.coverStyle ?? null;
  if (payload.coverPrompt !== undefined) updateData.coverPrompt = payload.coverPrompt ?? null;
  if (payload.rationale !== undefined) updateData.rationale = payload.rationale ?? null;
  if (payload.status !== undefined) updateData.status = payload.status ?? null;
  if (payload.model !== undefined) updateData.model = payload.model ?? null;
  if (payload.prompt !== undefined) updateData.prompt = payload.prompt ?? null;

  const [result] = await db
    .update(schema.creatives)
    .set(updateData)
    .where(eq(schema.creatives.id, payload.id))
    .returning();

  if (!result) {
    throw new Error('Creative not found');
  }

  return result;
}

export async function deleteCreative(id: number): Promise<{ success: true }> {
  await db.delete(schema.creatives).where(eq(schema.creatives.id, id));
  return { success: true };
}

export async function getCreative(id: number): Promise<Creative | null> {
  const [result] = await db
    .select()
    .from(schema.creatives)
    .where(eq(schema.creatives.id, id));

  return result ?? null;
}

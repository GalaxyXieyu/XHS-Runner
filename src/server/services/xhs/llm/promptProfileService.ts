import { db, schema } from '../../../db';
import { desc as descOrder, eq } from 'drizzle-orm';

function toNumber(value: any) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listPromptProfiles() {
  const profiles = schema.promptProfiles;

  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      system_prompt: profiles.systemPrompt,
      user_template: profiles.userTemplate,
      model: profiles.model,
      temperature: profiles.temperature,
      max_tokens: profiles.maxTokens,
      category: profiles.category,
      description: profiles.description,
      created_at: profiles.createdAt,
      updated_at: profiles.updatedAt,
    })
    .from(profiles)
    .orderBy(descOrder(profiles.id));

  return rows || [];
}

export async function getPromptProfile(id: number) {
  if (!id) {
    throw new Error('promptProfiles:get requires id');
  }

  const profiles = schema.promptProfiles;
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      system_prompt: profiles.systemPrompt,
      user_template: profiles.userTemplate,
      model: profiles.model,
      temperature: profiles.temperature,
      max_tokens: profiles.maxTokens,
      category: profiles.category,
      description: profiles.description,
      created_at: profiles.createdAt,
      updated_at: profiles.updatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);

  return rows[0];
}

export async function createPromptProfile(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('promptProfiles:create expects an object payload');
  }
  const name = String(payload.name || '').trim();
  const systemPrompt = String(payload.system_prompt || payload.systemPrompt || '').trim();
  const userTemplate = String(payload.user_template || payload.userTemplate || '').trim();

  if (!name) {
    throw new Error('Prompt profile name is required');
  }
  if (!systemPrompt) {
    throw new Error('system_prompt is required');
  }
  if (!userTemplate) {
    throw new Error('user_template is required');
  }

  const profiles = schema.promptProfiles;
  const rows = await db
    .insert(profiles)
    .values({
      name,
      systemPrompt,
      userTemplate,
      model: payload.model ? String(payload.model) : null,
      temperature: toNumber(payload.temperature),
      maxTokens: toNumber(payload.max_tokens ?? payload.maxTokens),
      category: payload.category ? String(payload.category) : null,
      description: payload.description ? String(payload.description) : null,
      updatedAt: new Date(),
    })
    .returning({
      id: profiles.id,
      name: profiles.name,
      system_prompt: profiles.systemPrompt,
      user_template: profiles.userTemplate,
      model: profiles.model,
      temperature: profiles.temperature,
      max_tokens: profiles.maxTokens,
      category: profiles.category,
      description: profiles.description,
      created_at: profiles.createdAt,
      updated_at: profiles.updatedAt,
    });

  return rows[0];
}

export async function updatePromptProfile(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('promptProfiles:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('promptProfiles:update requires id');
  }

  const updateData: any = { updatedAt: new Date() };
  if (payload.name !== undefined) updateData.name = String(payload.name);
  if (payload.system_prompt !== undefined || payload.systemPrompt !== undefined) {
    updateData.systemPrompt = String(payload.system_prompt || payload.systemPrompt);
  }
  if (payload.user_template !== undefined || payload.userTemplate !== undefined) {
    updateData.userTemplate = String(payload.user_template || payload.userTemplate);
  }
  if (payload.model !== undefined) updateData.model = payload.model ? String(payload.model) : null;
  if (payload.temperature !== undefined) updateData.temperature = toNumber(payload.temperature);
  if (payload.max_tokens !== undefined || payload.maxTokens !== undefined) {
    updateData.maxTokens = toNumber(payload.max_tokens ?? payload.maxTokens);
  }
  if (payload.category !== undefined) updateData.category = payload.category ? String(payload.category) : null;
  if (payload.description !== undefined) updateData.description = payload.description ? String(payload.description) : null;

  const profiles = schema.promptProfiles;
  const rows = await db
    .update(profiles)
    .set(updateData)
    .where(eq(profiles.id, payload.id))
    .returning({
      id: profiles.id,
      name: profiles.name,
      system_prompt: profiles.systemPrompt,
      user_template: profiles.userTemplate,
      model: profiles.model,
      temperature: profiles.temperature,
      max_tokens: profiles.maxTokens,
      category: profiles.category,
      description: profiles.description,
      created_at: profiles.createdAt,
      updated_at: profiles.updatedAt,
    });

  return rows[0];
}

export async function deletePromptProfile(id: number): Promise<boolean> {
  if (!id) {
    throw new Error('promptProfiles:delete requires id');
  }

  const profiles = schema.promptProfiles;
  const rows = await db
    .delete(profiles)
    .where(eq(profiles.id, id))
    .returning({ id: profiles.id });

  return rows.length > 0;
}

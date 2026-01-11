import { getDatabase } from '../../db';

function toNumber(value: any) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function listPromptProfiles() {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, name, system_prompt, user_template, model, temperature, max_tokens, created_at, updated_at
       FROM prompt_profiles
       ORDER BY id DESC`
    )
    .all();
}

export function getPromptProfile(id: number) {
  if (!id) {
    throw new Error('promptProfiles:get requires id');
  }
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, name, system_prompt, user_template, model, temperature, max_tokens, created_at, updated_at
       FROM prompt_profiles
       WHERE id = ?`
    )
    .get(id);
}

export function createPromptProfile(payload: Record<string, any>) {
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

  const model = payload.model ? String(payload.model) : null;
  const temperature = toNumber(payload.temperature);
  const maxTokens = toNumber(payload.max_tokens ?? payload.maxTokens);

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO prompt_profiles
       (name, system_prompt, user_template, model, temperature, max_tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name, systemPrompt, userTemplate, model, temperature, maxTokens);

  return getPromptProfile(result.lastInsertRowid as number);
}

export function updatePromptProfile(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('promptProfiles:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('promptProfiles:update requires id');
  }
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM prompt_profiles WHERE id = ?').get(payload.id);
  if (!existing) {
    throw new Error('Prompt profile not found');
  }

  const updates = {
    name: payload.name ? String(payload.name) : undefined,
    system_prompt: payload.system_prompt || payload.systemPrompt ? String(payload.system_prompt || payload.systemPrompt) : undefined,
    user_template: payload.user_template || payload.userTemplate ? String(payload.user_template || payload.userTemplate) : undefined,
    model: payload.model ? String(payload.model) : undefined,
    temperature: payload.temperature !== undefined ? toNumber(payload.temperature) : undefined,
    max_tokens: payload.max_tokens !== undefined || payload.maxTokens !== undefined ? toNumber(payload.max_tokens ?? payload.maxTokens) : undefined,
  };

  db.prepare(
    `UPDATE prompt_profiles
     SET name = COALESCE(?, name),
         system_prompt = COALESCE(?, system_prompt),
         user_template = COALESCE(?, user_template),
         model = COALESCE(?, model),
         temperature = COALESCE(?, temperature),
         max_tokens = COALESCE(?, max_tokens),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    updates.name,
    updates.system_prompt,
    updates.user_template,
    updates.model,
    updates.temperature,
    updates.max_tokens,
    payload.id
  );

  return getPromptProfile(payload.id);
}

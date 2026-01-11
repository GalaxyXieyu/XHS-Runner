import { getDatabase } from '../../db';

function parseJson(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function stringifyJson(value: any) {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : JSON.stringify(value);
}

function normalizeCreative(row: any) {
  if (!row) return row;
  return {
    ...row,
    tags: parseJson(row.tags),
    source_topic_ids: parseJson(row.source_topic_ids),
    rationale: parseJson(row.rationale_json),
  };
}

export function listCreatives(themeId?: number) {
  const db = getDatabase();
  if (themeId) {
    const rows = db
      .prepare(
        `SELECT id, theme_id, source_topic_id, source_topic_ids, title, content, script, tags,
                cover_style, cover_prompt, rationale_json, status, model, prompt,
                created_at, updated_at, result_asset_id
         FROM creatives
         WHERE theme_id = ?
         ORDER BY id DESC`
      )
      .all(themeId);
    return rows.map(normalizeCreative);
  }
  const rows = db
    .prepare(
      `SELECT id, theme_id, source_topic_id, source_topic_ids, title, content, script, tags,
              cover_style, cover_prompt, rationale_json, status, model, prompt,
              created_at, updated_at, result_asset_id
       FROM creatives
       ORDER BY id DESC`
    )
    .all();
  return rows.map(normalizeCreative);
}

export function createCreative(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('creatives:create expects an object payload');
  }
  const themeId = payload.themeId || null;
  const status = payload.status || 'draft';
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO creatives
       (theme_id, source_topic_id, source_topic_ids, title, content, script, tags, cover_style,
        cover_prompt, rationale_json, status, model, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      themeId,
      payload.sourceTopicId || null,
      stringifyJson(payload.sourceTopicIds),
      payload.title || null,
      payload.content || null,
      payload.script || null,
      stringifyJson(payload.tags),
      payload.coverStyle || null,
      payload.coverPrompt || null,
      stringifyJson(payload.rationale),
      status,
      payload.model || null,
      payload.prompt || null
    );

  const row = db
    .prepare(
      `SELECT id, theme_id, source_topic_id, source_topic_ids, title, content, script, tags,
              cover_style, cover_prompt, rationale_json, status, model, prompt,
              created_at, updated_at, result_asset_id
       FROM creatives
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);
  return normalizeCreative(row);
}

export function updateCreative(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('creatives:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('creatives:update requires id');
  }
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM creatives WHERE id = ?').get(payload.id);
  if (!existing) {
    throw new Error('Creative not found');
  }

  db.prepare(
    `UPDATE creatives
     SET theme_id = COALESCE(?, theme_id),
         source_topic_id = COALESCE(?, source_topic_id),
         source_topic_ids = COALESCE(?, source_topic_ids),
         title = COALESCE(?, title),
         content = COALESCE(?, content),
         script = COALESCE(?, script),
         tags = COALESCE(?, tags),
         cover_style = COALESCE(?, cover_style),
         cover_prompt = COALESCE(?, cover_prompt),
         rationale_json = COALESCE(?, rationale_json),
         status = COALESCE(?, status),
         model = COALESCE(?, model),
         prompt = COALESCE(?, prompt),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    payload.themeId,
    payload.sourceTopicId,
    stringifyJson(payload.sourceTopicIds),
    payload.title,
    payload.content,
    payload.script,
    stringifyJson(payload.tags),
    payload.coverStyle,
    payload.coverPrompt,
    stringifyJson(payload.rationale),
    payload.status,
    payload.model,
    payload.prompt,
    payload.id
  );

  const row = db
    .prepare(
      `SELECT id, theme_id, source_topic_id, source_topic_ids, title, content, script, tags,
              cover_style, cover_prompt, rationale_json, status, model, prompt,
              created_at, updated_at, result_asset_id
       FROM creatives
       WHERE id = ?`
    )
    .get(payload.id);
  return normalizeCreative(row);
}

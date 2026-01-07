const { getDatabase } = require('./db');

function stringifyJson(value) {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : JSON.stringify(value);
}

function listCreatives(themeId) {
  const db = getDatabase();
  if (themeId) {
    return db
      .prepare(
        `SELECT id, theme_id, source_topic_id, title, content, script, tags, cover_style,
                status, model, prompt, created_at, updated_at, result_asset_id
         FROM creatives
         WHERE theme_id = ?
         ORDER BY id DESC`
      )
      .all(themeId);
  }
  return db
    .prepare(
      `SELECT id, theme_id, source_topic_id, title, content, script, tags, cover_style,
              status, model, prompt, created_at, updated_at, result_asset_id
       FROM creatives
       ORDER BY id DESC`
    )
    .all();
}

function createCreative(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('creatives:create expects an object payload');
  }
  const themeId = payload.themeId || null;
  const status = payload.status || 'draft';
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO creatives
       (theme_id, source_topic_id, title, content, script, tags, cover_style, status, model, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      themeId,
      payload.sourceTopicId || null,
      payload.title || null,
      payload.content || null,
      payload.script || null,
      stringifyJson(payload.tags),
      payload.coverStyle || null,
      status,
      payload.model || null,
      payload.prompt || null
    );

  return db
    .prepare(
      `SELECT id, theme_id, source_topic_id, title, content, script, tags, cover_style,
              status, model, prompt, created_at, updated_at, result_asset_id
       FROM creatives
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);
}

function updateCreative(payload) {
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
         title = COALESCE(?, title),
         content = COALESCE(?, content),
         script = COALESCE(?, script),
         tags = COALESCE(?, tags),
         cover_style = COALESCE(?, cover_style),
         status = COALESCE(?, status),
         model = COALESCE(?, model),
         prompt = COALESCE(?, prompt),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    payload.themeId,
    payload.sourceTopicId,
    payload.title,
    payload.content,
    payload.script,
    stringifyJson(payload.tags),
    payload.coverStyle,
    payload.status,
    payload.model,
    payload.prompt,
    payload.id
  );

  return db
    .prepare(
      `SELECT id, theme_id, source_topic_id, title, content, script, tags, cover_style,
              status, model, prompt, created_at, updated_at, result_asset_id
       FROM creatives
       WHERE id = ?`
    )
    .get(payload.id);
}

module.exports = {
  createCreative,
  listCreatives,
  updateCreative,
};

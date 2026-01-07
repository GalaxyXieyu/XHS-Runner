const { getDatabase } = require('./db');

function stringifyJson(value) {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : JSON.stringify(value);
}

function enqueuePublish(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('publish:enqueue expects an object payload');
  }
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO publish_records
       (account_id, theme_id, creative_id, note_id, xsec_token, type, title, content, tags, media_urls,
        status, scheduled_at, published_at, created_at, updated_at, response_json, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, NULL, datetime('now'), datetime('now'), NULL, NULL)`
    )
    .run(
      payload.accountId || null,
      payload.themeId || null,
      payload.creativeId || null,
      payload.noteId || null,
      payload.xsecToken || null,
      payload.type || null,
      payload.title || null,
      payload.content || null,
      stringifyJson(payload.tags),
      stringifyJson(payload.mediaUrls),
      payload.scheduledAt || null
    );

  return db
    .prepare(
      `SELECT id, account_id, theme_id, creative_id, note_id, xsec_token, type, title, content,
              tags, media_urls, status, scheduled_at, published_at, created_at, updated_at
       FROM publish_records
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);
}

function listPublishes(themeId) {
  const db = getDatabase();
  if (themeId) {
    return db
      .prepare(
        `SELECT id, account_id, theme_id, creative_id, note_id, xsec_token, type, title, content,
                tags, media_urls, status, scheduled_at, published_at, created_at, updated_at
         FROM publish_records
         WHERE theme_id = ?
         ORDER BY id DESC`
      )
      .all(themeId);
  }
  return db
    .prepare(
      `SELECT id, account_id, theme_id, creative_id, note_id, xsec_token, type, title, content,
              tags, media_urls, status, scheduled_at, published_at, created_at, updated_at
       FROM publish_records
       ORDER BY id DESC`
    )
    .all();
}

module.exports = {
  enqueuePublish,
  listPublishes,
};

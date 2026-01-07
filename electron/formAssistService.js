const { getDatabase } = require('./db');

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function listFormAssists(themeId) {
  const db = getDatabase();
  const rows = themeId
    ? db
        .prepare(
          `SELECT id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at
           FROM form_assist_records
           WHERE theme_id = ?
           ORDER BY id DESC`
        )
        .all(themeId)
    : db
        .prepare(
          `SELECT id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at
           FROM form_assist_records
           ORDER BY id DESC`
        )
        .all();

  return rows.map((row) => ({
    ...row,
    suggestion: parseJson(row.suggestion_json),
    applied: parseJson(row.applied_json),
    feedback: parseJson(row.feedback_json),
  }));
}

function generateSuggestion(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:generate expects an object payload');
  }
  if (!payload.themeId) {
    throw new Error('formAssist:generate requires themeId');
  }

  const suggestion = {
    title: payload.titleHint ? `建议标题：${payload.titleHint}` : '建议标题：小红书爆款主题',
    content: payload.contentHint || '建议正文：请根据主题补充内容。',
    tags: payload.tags || [],
  };

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO form_assist_records
       (theme_id, suggestion_json, status, created_at, updated_at)
       VALUES (?, ?, 'suggested', datetime('now'), datetime('now'))`
    )
    .run(payload.themeId, JSON.stringify(suggestion));

  return {
    id: result.lastInsertRowid,
    theme_id: payload.themeId,
    suggestion,
    status: 'suggested',
  };
}

function applySuggestion(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:apply expects an object payload');
  }
  if (!payload.id) {
    throw new Error('formAssist:apply requires id');
  }
  const db = getDatabase();
  db.prepare(
    `UPDATE form_assist_records
     SET applied_json = ?, status = 'applied', updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(payload.applied || {}), payload.id);

  const row = db
    .prepare(
      `SELECT id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at
       FROM form_assist_records
       WHERE id = ?`
    )
    .get(payload.id);

  return {
    ...row,
    suggestion: parseJson(row.suggestion_json),
    applied: parseJson(row.applied_json),
    feedback: parseJson(row.feedback_json),
  };
}

function saveFeedback(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:feedback expects an object payload');
  }
  if (!payload.id) {
    throw new Error('formAssist:feedback requires id');
  }
  const db = getDatabase();
  db.prepare(
    `UPDATE form_assist_records
     SET feedback_json = ?, status = 'feedback', updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(payload.feedback || {}), payload.id);

  const row = db
    .prepare(
      `SELECT id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at
       FROM form_assist_records
       WHERE id = ?`
    )
    .get(payload.id);

  return {
    ...row,
    suggestion: parseJson(row.suggestion_json),
    applied: parseJson(row.applied_json),
    feedback: parseJson(row.feedback_json),
  };
}

module.exports = {
  applySuggestion,
  generateSuggestion,
  listFormAssists,
  saveFeedback,
};

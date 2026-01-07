const { getDatabase } = require('./db');

function listCompetitors(themeId) {
  if (!themeId) {
    throw new Error('competitors:list requires themeId');
  }
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, theme_id, xhs_user_id, name, last_monitored_at, created_at, updated_at
       FROM competitors
       WHERE theme_id = ?
       ORDER BY id DESC`
    )
    .all(themeId);
}

function addCompetitor(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('competitors:add expects an object payload');
  }
  if (!payload.themeId) {
    throw new Error('competitors:add requires themeId');
  }
  const xhsUserId = payload.xhsUserId ? String(payload.xhsUserId) : null;
  const name = payload.name ? String(payload.name) : null;
  if (!xhsUserId && !name) {
    throw new Error('competitors:add requires name or xhsUserId');
  }
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO competitors
       (theme_id, xhs_user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(payload.themeId, xhsUserId, name);
  return db
    .prepare(
      `SELECT id, theme_id, xhs_user_id, name, last_monitored_at, created_at, updated_at
       FROM competitors
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);
}

function removeCompetitor(id) {
  if (!id) {
    throw new Error('competitors:remove requires id');
  }
  const db = getDatabase();
  db.prepare('DELETE FROM competitors WHERE id = ?').run(id);
  return { id };
}

module.exports = {
  addCompetitor,
  listCompetitors,
  removeCompetitor,
};

const { getDatabase } = require('./db');
const { canTransition, getAllowedTransitions } = require('./workflow');

function listTopics(limit = 100) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, source, source_id, status, created_at
       FROM topics
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
  return rows.map((row) => ({
    ...row,
    allowedStatuses: getAllowedTransitions(row.status),
  }));
}

function updateTopicStatus(id, nextStatus) {
  const db = getDatabase();
  const current = db.prepare('SELECT status FROM topics WHERE id = ?').get(id);
  if (!current) {
    throw new Error('Topic not found');
  }
  if (!canTransition(current.status, nextStatus)) {
    throw new Error(`Invalid transition from ${current.status} to ${nextStatus}`);
  }
  db.prepare('UPDATE topics SET status = ? WHERE id = ?').run(nextStatus, id);
  return db.prepare('SELECT id, status FROM topics WHERE id = ?').get(id);
}

function forceUpdateTopicStatus(id, nextStatus) {
  const db = getDatabase();
  db.prepare('UPDATE topics SET status = ? WHERE id = ?').run(nextStatus, id);
  return db.prepare('SELECT id, status FROM topics WHERE id = ?').get(id);
}

module.exports = {
  forceUpdateTopicStatus,
  listTopics,
  updateTopicStatus,
};

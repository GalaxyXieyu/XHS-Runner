import { getDatabase } from '../../db';

export function listInteractions(publishRecordId?: number) {
  const db = getDatabase();
  if (publishRecordId) {
    return db
      .prepare(
        `SELECT id, publish_record_id, type, status, content, created_at, updated_at
         FROM interaction_tasks
         WHERE publish_record_id = ?
         ORDER BY id DESC`
      )
      .all(publishRecordId);
  }
  return db
    .prepare(
      `SELECT id, publish_record_id, type, status, content, created_at, updated_at
       FROM interaction_tasks
       ORDER BY id DESC`
    )
    .all();
}

export function enqueueInteraction(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('interactions:enqueue expects an object payload');
  }
  if (!payload.publishRecordId) {
    throw new Error('interactions:enqueue requires publishRecordId');
  }
  if (!payload.type) {
    throw new Error('interactions:enqueue requires type');
  }
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO interaction_tasks
       (publish_record_id, type, status, content, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`
    )
    .run(payload.publishRecordId, payload.type, payload.content || null);
  return db
    .prepare(
      `SELECT id, publish_record_id, type, status, content, created_at, updated_at
       FROM interaction_tasks
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);
}

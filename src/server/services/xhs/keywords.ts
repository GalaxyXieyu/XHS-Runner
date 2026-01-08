import { getDatabase } from '../../db';

export function listKeywords() {
  const db = getDatabase();
  return db
    .prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords ORDER BY id DESC')
    .all();
}

export function addKeyword(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error('Keyword value is required');
  }
  const db = getDatabase();
  db.prepare(
    `INSERT INTO keywords (value, is_enabled, created_at, updated_at)
     VALUES (?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(value) DO UPDATE SET
       is_enabled = excluded.is_enabled,
       updated_at = excluded.updated_at`
  ).run(trimmed);
  return db.prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords WHERE value = ?').get(trimmed);
}

export function updateKeyword(id: number, value: string, isEnabled?: number | boolean) {
  const db = getDatabase();
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error('Keyword value is required');
  }
  db.prepare(
    `UPDATE keywords
     SET value = ?, is_enabled = COALESCE(?, is_enabled), updated_at = datetime('now')
     WHERE id = ?`
  ).run(trimmed, isEnabled, id);
  return db.prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords WHERE id = ?').get(id);
}

export function removeKeyword(id: number) {
  const db = getDatabase();
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
  return { id };
}

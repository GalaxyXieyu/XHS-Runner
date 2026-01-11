import { getDatabase } from '../../db';
import { canTransition, getAllowedTransitions } from './workflow';

export function listTopics(limit = 100) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, source, source_id, status, created_at
       FROM topics
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
  return rows.map((row: any) => ({
    ...row,
    allowedStatuses: getAllowedTransitions(row.status),
  }));
}

export function listTopicsByTheme(themeId: number, limit = 50) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT t.id, t.title, t.url, t.author_name, t.author_avatar_url,
              t.like_count, t.collect_count, t.comment_count, t.cover_url,
              t.published_at, t.status, k.value as keyword
       FROM topics t
       LEFT JOIN keywords k ON t.keyword_id = k.id
       WHERE t.theme_id = ?
       ORDER BY t.like_count DESC
       LIMIT ?`
    )
    .all(themeId, limit);
}

export function listTopicsByKeyword(keywordId: number, limit = 50) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, title, url, author_name, author_avatar_url,
              like_count, collect_count, comment_count, cover_url,
              published_at, status
       FROM topics
       WHERE keyword_id = ?
       ORDER BY like_count DESC
       LIMIT ?`
    )
    .all(keywordId, limit);
}

export function updateTopicStatus(id: number, nextStatus: string) {
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

export function forceUpdateTopicStatus(id: number, nextStatus: string) {
  const db = getDatabase();
  db.prepare('UPDATE topics SET status = ? WHERE id = ?').run(nextStatus, id);
  return db.prepare('SELECT id, status FROM topics WHERE id = ?').get(id);
}

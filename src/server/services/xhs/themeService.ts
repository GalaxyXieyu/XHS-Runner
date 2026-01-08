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

function listThemeKeywords(db: any, themeId: number) {
  return db
    .prepare(
      `SELECT id,
              COALESCE(keyword, value) AS value,
              source,
              status,
              created_at,
              updated_at
       FROM keywords
       WHERE theme_id = ?
       ORDER BY id DESC`
    )
    .all(themeId);
}

function listThemeCompetitors(db: any, themeId: number) {
  return db
    .prepare(
      `SELECT id, xhs_user_id, name, last_monitored_at, created_at, updated_at
       FROM competitors
       WHERE theme_id = ?
       ORDER BY id DESC`
    )
    .all(themeId);
}

export function listThemes() {
  const db = getDatabase();
  const themes = db
    .prepare(
      `SELECT id, name, description, status, analytics_json, created_at, updated_at
       FROM themes
       ORDER BY id DESC`
    )
    .all();

  return themes.map((theme: any) => ({
    ...theme,
    analytics: parseJson(theme.analytics_json),
    keywords: listThemeKeywords(db, theme.id),
    competitors: listThemeCompetitors(db, theme.id),
  }));
}

export function createTheme(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('themes:create expects an object payload');
  }
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('Theme name is required');
  }
  const description = payload.description ? String(payload.description) : null;
  const status = payload.status || 'active';
  const analyticsJson = payload.analytics ? JSON.stringify(payload.analytics) : null;

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO themes (name, description, status, analytics_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name, description, status, analyticsJson);

  const themeId = result.lastInsertRowid;
  if (Array.isArray(payload.keywords)) {
    payload.keywords.forEach((keywordValue: any) => {
      const value = String(keywordValue || '').trim();
      if (!value) {
        return;
      }
      db.prepare(
        `INSERT INTO keywords
         (theme_id, value, keyword, source, status, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, 'manual', 'active', 1, datetime('now'), datetime('now'))`
      ).run(themeId, value, value);
    });
  }

  if (Array.isArray(payload.competitors)) {
    payload.competitors.forEach((competitor: any) => {
      const entry = typeof competitor === 'object' ? competitor : { name: competitor };
      const nameValue = entry?.name ? String(entry.name) : null;
      const xhsUserId = entry?.xhs_user_id ? String(entry.xhs_user_id) : null;
      if (!nameValue && !xhsUserId) {
        return;
      }
      db.prepare(
        `INSERT INTO competitors
         (theme_id, xhs_user_id, name, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      ).run(themeId, xhsUserId, nameValue);
    });
  }

  return db
    .prepare('SELECT id, name, description, status, analytics_json, created_at, updated_at FROM themes WHERE id = ?')
    .get(themeId);
}

export function updateTheme(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('themes:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('themes:update requires id');
  }
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM themes WHERE id = ?').get(payload.id);
  if (!existing) {
    throw new Error('Theme not found');
  }

  const updates = {
    name: payload.name,
    description: payload.description,
    status: payload.status,
    analytics_json: payload.analytics ? JSON.stringify(payload.analytics) : undefined,
  };

  db.prepare(
    `UPDATE themes
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         analytics_json = COALESCE(?, analytics_json),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(updates.name, updates.description, updates.status, updates.analytics_json, payload.id);

  return db
    .prepare('SELECT id, name, description, status, analytics_json, created_at, updated_at FROM themes WHERE id = ?')
    .get(payload.id);
}

export function removeTheme(id: number) {
  if (!id) {
    throw new Error('themes:remove requires id');
  }
  const db = getDatabase();
  db.prepare('DELETE FROM keywords WHERE theme_id = ?').run(id);
  db.prepare('DELETE FROM competitors WHERE theme_id = ?').run(id);
  db.prepare('DELETE FROM themes WHERE id = ?').run(id);
  return { id };
}

export function setThemeStatus(id: number, status: string) {
  if (!id) {
    throw new Error('themes:setStatus requires id');
  }
  const nextStatus = status || 'active';
  const db = getDatabase();
  db.prepare(
    `UPDATE themes
     SET status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, id);
  return db.prepare('SELECT id, status FROM themes WHERE id = ?').get(id);
}

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

function getInsights(themeId) {
  if (!themeId) {
    throw new Error('insights:get requires themeId');
  }
  const db = getDatabase();
  const row = db.prepare('SELECT analytics_json FROM themes WHERE id = ?').get(themeId);
  if (!row) {
    throw new Error('Theme not found');
  }
  return parseJson(row.analytics_json) || { top_tags: [], title_patterns: [], comment_insights: [] };
}

function refreshInsights(themeId) {
  if (!themeId) {
    throw new Error('insights:refresh requires themeId');
  }
  const payload = {
    top_tags: [],
    title_patterns: [],
    comment_insights: [],
    generated_at: new Date().toISOString(),
  };
  const db = getDatabase();
  const result = db.prepare('SELECT id FROM themes WHERE id = ?').get(themeId);
  if (!result) {
    throw new Error('Theme not found');
  }
  db.prepare(
    `UPDATE themes
     SET analytics_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(payload), themeId);
  return payload;
}

module.exports = {
  getInsights,
  refreshInsights,
};

const { getDatabase } = require('./db');
const { getSetting, getSettings, setSetting } = require('./settings');
const { fetchTopNotes } = require('./xhsClient');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getKeyword(id) {
  const db = getDatabase();
  return db.prepare('SELECT id, value FROM keywords WHERE id = ?').get(id);
}

function listRecentTopics(keywordId, limit) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, title, source, source_id, url, created_at
       FROM topics WHERE keyword_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(keywordId, limit);
}

function insertTopic(keywordId, note) {
  const db = getDatabase();
  const exists = db
    .prepare('SELECT id FROM topics WHERE source = ? AND source_id = ?')
    .get('xhs', note.id);
  if (exists) {
    return null;
  }
  const result = db
    .prepare(
      `INSERT INTO topics (keyword_id, title, source, source_id, url, created_at)
       VALUES (?, ?, 'xhs', ?, ?, datetime('now'))`
    )
    .run(keywordId, note.title, note.id, note.url);
  return result.lastInsertRowid;
}

async function enforceRateLimit(rateLimitMs) {
  const lastRequestAt = getSetting('capture:lastRequestAt');
  if (!lastRequestAt || !rateLimitMs) {
    return;
  }
  const elapsed = Date.now() - new Date(lastRequestAt).getTime();
  if (elapsed < rateLimitMs) {
    await sleep(rateLimitMs - elapsed);
  }
}

async function fetchWithRetry(keyword, limit, retryCount) {
  let attempt = 0;
  while (true) {
    try {
      return await fetchTopNotes(keyword, limit);
    } catch (error) {
      attempt += 1;
      if (attempt > retryCount) {
        throw error;
      }
      await sleep(500 * attempt);
    }
  }
}

async function runCapture(keywordId, limit = 50) {
  const settings = getSettings();
  if (!settings.captureEnabled) {
    throw new Error('Capture is disabled by settings');
  }

  const keyword = getKeyword(keywordId);
  if (!keyword) {
    throw new Error('Keyword not found');
  }

  const cacheKey = `capture:last:${keywordId}`;
  const lastCaptureAt = getSetting(cacheKey);
  const cacheWindowMs = settings.captureFrequencyMinutes * 60 * 1000;
  if (lastCaptureAt) {
    const elapsed = Date.now() - new Date(lastCaptureAt).getTime();
    if (elapsed < cacheWindowMs) {
      return {
        status: 'cached',
        items: listRecentTopics(keywordId, limit),
      };
    }
  }

  await enforceRateLimit(settings.captureRateLimitMs);
  const notes = await fetchWithRetry(keyword.value, limit, settings.captureRetryCount);

  let inserted = 0;
  notes.forEach((note) => {
    if (note && note.id) {
      const rowId = insertTopic(keywordId, note);
      if (rowId) {
        inserted += 1;
      }
    }
  });

  const now = new Date().toISOString();
  setSetting(cacheKey, now);
  setSetting('capture:lastRequestAt', now);

  return {
    status: 'fetched',
    total: notes.length,
    inserted,
  };
}

module.exports = {
  runCapture,
};

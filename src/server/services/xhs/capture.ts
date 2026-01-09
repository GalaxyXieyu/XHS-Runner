import { getDatabase } from '../../db';
import { getSetting, getSettings, setSetting } from '../../settings';
import { fetchTopNotes } from './xhsClient';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getKeyword(id: number) {
  const db = getDatabase();
  return db.prepare('SELECT id, value, theme_id FROM keywords WHERE id = ?').get(id);
}

function listRecentTopics(keywordId: number, limit: number) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id, title, source, source_id, url, status, created_at
       FROM topics WHERE keyword_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(keywordId, limit);
}

function serializeJson(value: any) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return null;
  }
}

function insertTopic(
  keywordId: number,
  themeId: number | null | undefined,
  note: {
    id: string;
    title: string;
    url?: string | null;
    note_id?: string | null;
    xsec_token?: string | null;
    desc?: string | null;
    note_type?: string | null;
    tags?: string[] | string | null;
    cover_url?: string | null;
    media_urls?: string[] | null;
    author_id?: string | null;
    author_name?: string | null;
    author_avatar_url?: string | null;
    like_count?: number | null;
    collect_count?: number | null;
    comment_count?: number | null;
    share_count?: number | null;
    published_at?: string | null;
    fetched_at?: string | null;
    raw_json?: any;
  }
) {
  const db = getDatabase();
  const exists = db
    .prepare('SELECT id FROM topics WHERE source = ? AND source_id = ?')
    .get('xhs', note.id);
  if (exists) {
    return null;
  }
  const now = note.fetched_at || new Date().toISOString();
  const tags = serializeJson(note.tags);
  const mediaUrls = serializeJson(note.media_urls);
  const rawJson = serializeJson(note.raw_json ?? note);
  const result = db
    .prepare(
      `INSERT INTO topics (
         keyword_id,
         title,
         source,
         source_id,
         url,
         status,
         created_at,
         theme_id,
         note_id,
         xsec_token,
         desc,
         note_type,
         tags,
         cover_url,
         media_urls,
         author_id,
         author_name,
         author_avatar_url,
         like_count,
         collect_count,
         comment_count,
         share_count,
         published_at,
         fetched_at,
         raw_json
       )
       VALUES (?, ?, 'xhs', ?, ?, 'captured', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      keywordId,
      note.title || note.desc || note.id,
      note.id,
      note.url,
      themeId ?? null,
      note.note_id || note.id,
      note.xsec_token,
      note.desc,
      note.note_type,
      tags,
      note.cover_url,
      mediaUrls,
      note.author_id,
      note.author_name,
      note.author_avatar_url,
      note.like_count,
      note.collect_count,
      note.comment_count,
      note.share_count,
      note.published_at,
      now,
      rawJson
    );
  return result.lastInsertRowid;
}

async function enforceRateLimit(rateLimitMs: number) {
  const lastRequestAt = getSetting('capture:lastRequestAt');
  if (!lastRequestAt || !rateLimitMs) {
    return;
  }
  const elapsed = Date.now() - new Date(lastRequestAt).getTime();
  if (elapsed < rateLimitMs) {
    await sleep(rateLimitMs - elapsed);
  }
}

async function fetchWithRetry(keyword: string, limit: number, retryCount: number) {
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

export async function runCapture(keywordId: number, limit = 50) {
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
  notes.forEach((note: any) => {
    if (note && note.id) {
      const rowId = insertTopic(keywordId, keyword.theme_id, note);
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

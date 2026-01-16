import { getDatabase } from '../../../db';
import { getSetting, getSettings, setSetting } from '../../../settings';
import { fetchTopNotes, fetchNoteDetail } from './xhsClient';

// 检测小红书安全限制
const RATE_LIMIT_KEYWORDS = ['安全限制', '访问频次异常', '请勿频繁操作', '300013'];

function isRateLimited(text: string | null | undefined): boolean {
  if (!text) return false;
  return RATE_LIMIT_KEYWORDS.some(keyword => text.includes(keyword));
}

export class RateLimitError extends Error {
  constructor(message = '小红书安全限制：访问频次异常，已自动停止抓取') {
    super(message);
    this.name = 'RateLimitError';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getKeyword(id: number): Promise<{ id: number; value: string; theme_id: number | null } | undefined> {
  const db = getDatabase();
  const { data, error } = await db
    .from('keywords')
    .select('id, value, keyword, theme_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;

  return {
    id: Number(data.id),
    value: String((data as any).keyword || data.value),
    theme_id: data.theme_id === null || data.theme_id === undefined ? null : Number(data.theme_id),
  };
}

async function listRecentTopics(keywordId: number, limit: number) {
  const db = getDatabase();
  const { data, error } = await db
    .from('topics')
    .select('id, title, source, source_id, url, status, created_at')
    .eq('keyword_id', keywordId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function serializeJson(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// 解析中文相对时间（如"9小时前"、"3天前"、"刚刚"）为 ISO 时间戳
function parseRelativeTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;

  const str = timeStr.trim();
  const now = new Date();

  // 已经是有效的 ISO 时间戳格式
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fall through
    }
  }

  // 刚刚
  if (str === '刚刚' || str === '刚才') {
    return now.toISOString();
  }

  // X分钟前
  const minutesMatch = str.match(/(\d+)\s*分钟前/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
  }

  // X小时前
  const hoursMatch = str.match(/(\d+)\s*小时前/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  }

  // X天前
  const daysMatch = str.match(/(\d+)\s*天前/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  // X周前
  const weeksMatch = str.match(/(\d+)\s*周前/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  // X月前
  const monthsMatch = str.match(/(\d+)\s*月前/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
  }

  // X年前
  const yearsMatch = str.match(/(\d+)\s*年前/);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1], 10);
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString();
  }

  // 昨天
  if (str.includes('昨天')) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }

  // 前天
  if (str.includes('前天')) {
    return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  }

  // MM-DD 格式 (如 "01-09", "12-25")
  const mmddMatch = str.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mmddMatch) {
    const month = parseInt(mmddMatch[1], 10) - 1;
    const day = parseInt(mmddMatch[2], 10);
    const d = new Date(now.getFullYear(), month, day);
    // 如果日期在未来，说明是去年的
    if (d > now) {
      d.setFullYear(d.getFullYear() - 1);
    }
    return d.toISOString();
  }

  // YYYY-MM-DD 或 YYYY/MM/DD 格式
  const fullDateMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (fullDateMatch) {
    const year = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10) - 1;
    const day = parseInt(fullDateMatch[3], 10);
    return new Date(year, month, day).toISOString();
  }

  // 无法解析，返回 null
  console.log(`[capture] Unable to parse time: "${str}"`);
  return null;
}

// 脏数据过滤：检测无效笔记
function isInvalidNote(note: { title?: string; desc?: string; id?: string }): boolean {
  const title = note.title || '';
  const desc = note.desc || '';

  // 过滤 "Note X" 格式的测试/无效数据
  if (/^Note\s*\d+$/i.test(title.trim())) return true;

  // 过滤标题为空或太短的笔记
  if (title.trim().length < 2) return true;

  // 过滤纯数字标题
  if (/^\d+$/.test(title.trim())) return true;

  return false;
}

async function insertTopic(
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
  const now = note.fetched_at || new Date().toISOString();
  const tags = serializeJson(note.tags);
  const mediaUrls = serializeJson(note.media_urls);
  const rawJson = serializeJson(note.raw_json ?? note);

  // 使用 upsert 避免主键冲突，基于 source + source_id 去重
  const { data: upserted, error } = await db
    .from('topics')
    .upsert({
      keyword_id: keywordId,
      title: note.title || note.desc || note.id,
      source: 'xhs',
      source_id: note.id,
      url: note.url || null,
      status: 'captured',
      theme_id: themeId ?? null,
      note_id: note.note_id || note.id,
      xsec_token: note.xsec_token || null,
      desc: note.desc || null,
      note_type: note.note_type || null,
      tags,
      cover_url: note.cover_url || null,
      media_urls: mediaUrls,
      author_id: note.author_id || null,
      author_name: note.author_name || null,
      author_avatar_url: note.author_avatar_url || null,
      like_count: note.like_count ?? null,
      collect_count: note.collect_count ?? null,
      comment_count: note.comment_count ?? null,
      share_count: note.share_count ?? null,
      published_at: parseRelativeTime(note.published_at),
      fetched_at: now,
      raw_json: rawJson,
      created_at: new Date().toISOString(),
    }, {
      onConflict: 'source,source_id',
      ignoreDuplicates: true,  // 如果已存在则跳过，不更新
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // 忽略重复键错误
    if (error.code === '23505') {
      console.log(`[capture] Duplicate note skipped: ${note.id}`);
      return null;
    }
    throw error;
  }
  return upserted?.id ?? null;
}

async function enforceRateLimit(rateLimitMs: number) {
  const lastRequestAt = await getSetting('capture:lastRequestAt');
  if (!lastRequestAt || !rateLimitMs) return;
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
      if (attempt > retryCount) throw error;
      await sleep(500 * attempt);
    }
  }
}

export async function runCapture(keywordId: number, limit = 50) {
  const settings = await getSettings();
  if (!settings.captureEnabled) {
    throw new Error('Capture is disabled by settings');
  }

  const keyword = await getKeyword(keywordId);
  if (!keyword) {
    throw new Error('Keyword not found');
  }

  const cacheKey = `capture:last:${keywordId}`;
  const lastCaptureAt = await getSetting(cacheKey);
  const cacheWindowMs = settings.captureFrequencyMinutes * 60 * 1000;
  if (lastCaptureAt) {
    const elapsed = Date.now() - new Date(lastCaptureAt).getTime();
    if (elapsed < cacheWindowMs) {
      return {
        status: 'cached',
        items: await listRecentTopics(keywordId, limit),
      };
    }
  }

  await enforceRateLimit(settings.captureRateLimitMs);
  const notes = await fetchWithRetry(keyword.value, limit, settings.captureRetryCount);

  if (notes.length > 0) {
    console.log('[capture] First note raw data:', JSON.stringify(notes[0], null, 2));
  }

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note && note.id) {
      // 过滤脏数据
      if (isInvalidNote(note)) {
        console.log(`[capture] Skipping invalid note: "${note.title || note.id}"`);
        skipped++;
        continue;
      }

      if (i > 0) {
        // 增加请求间隔，避免触发限流 (5-8秒随机延迟)
        const delay = 5000 + Math.random() * 3000;
        await sleep(delay);
      }

      let enrichedNote = note;
      const xsecToken = (note as any).xsec_token;
      if (xsecToken && !note.desc) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[capture] Fetching detail for ${note.id} (attempt ${attempt})...`);
            const detail = await fetchNoteDetail(note.id, { xsecToken });
            if (detail?.desc) {
              // 检测安全限制
              if (isRateLimited(detail.desc)) {
                console.error(`[capture] Rate limit detected! Stopping capture immediately.`);
                throw new RateLimitError();
              }
              enrichedNote = { ...note, desc: detail.desc };
              console.log(`[capture] Got desc for ${note.id}: ${detail.desc.slice(0, 50)}...`);
              break;
            }
          } catch (e: any) {
            // 如果是限流错误，直接向上抛出
            if (e instanceof RateLimitError) throw e;
            console.warn(`[capture] Attempt ${attempt} failed for ${note.id}:`, e.message);
            if (attempt < 2) await sleep(2000);
          }
        }
      }
      const rowId = await insertTopic(keywordId, keyword.theme_id, enrichedNote);
      if (rowId) inserted += 1;
    }
  }

  const now = new Date().toISOString();
  await Promise.all([setSetting(cacheKey, now), setSetting('capture:lastRequestAt', now)]);

  return { status: 'fetched', total: notes.length, inserted, skipped };
}

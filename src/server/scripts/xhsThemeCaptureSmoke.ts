import { getDatabase } from '../db';
import { setSettings } from '../settings';
import { createTheme } from '../services/xhs/themeService';
import { runCapture } from '../services/xhs/capture';
import { checkStatus, login } from '../services/xhs/localService';

const DEFAULT_KEYWORDS = ['小红书', '热点'];
const DEFAULT_LIMIT = 5;

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseKeywords(raw: string | undefined) {
  if (!raw) {
    return DEFAULT_KEYWORDS;
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function ensureLogin(timeout: number) {
  const status = await checkStatus();
  if (status?.loggedIn) {
    console.log('[xhs-theme-smoke] already logged in');
    return status;
  }
  console.log('[xhs-theme-smoke] starting login flow...');
  const loginResult = await login({ timeout });
  console.log('[xhs-theme-smoke] login result:', loginResult);
  return checkStatus();
}

function listThemeKeywords(themeId: number) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT id,
              COALESCE(keyword, value) AS value,
              status
       FROM keywords
       WHERE theme_id = ?
       ORDER BY id DESC`
    )
    .all(themeId);
}

function getTopicStats(keywordId: number) {
  const db = getDatabase();
  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM topics WHERE keyword_id = ?').get(keywordId);
  const sample = db
    .prepare(
      `SELECT id, title, source_id, xsec_token, url, created_at
       FROM topics
       WHERE keyword_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(keywordId);
  return {
    total: totalRow?.total ?? 0,
    sample,
  };
}

async function run() {
  if (!process.env.XHS_HEADLESS) {
    process.env.XHS_HEADLESS = 'false';
  }

  const themeName = process.env.XHS_TEST_THEME_NAME || `主题冒烟-${Date.now()}`;
  const themeDescription = process.env.XHS_TEST_THEME_DESC || '多关键词抓取冒烟测试';
  const keywords = parseKeywords(process.env.XHS_TEST_KEYWORDS);
  const limit = toNumber(process.env.XHS_TEST_LIMIT, DEFAULT_LIMIT);
  const timeout = toNumber(process.env.XHS_LOGIN_TIMEOUT, 300);
  const skipLogin = process.env.XHS_SMOKE_SKIP_LOGIN === 'true';

  if (!keywords.length) {
    throw new Error('No keywords provided for capture smoke test.');
  }

  await setSettings({ captureEnabled: true });

  if (!skipLogin) {
    console.log('[xhs-theme-smoke] checking login status...');
    const status = await ensureLogin(timeout);
    console.log('[xhs-theme-smoke] status:', status);
  }

  console.log('[xhs-theme-smoke] creating theme with keywords:', keywords);
  const theme = await createTheme({
    name: themeName,
    description: themeDescription,
    keywords,
  });

  const themeId = Number(theme.id);
  const themeKeywords = listThemeKeywords(themeId);
  console.log('[xhs-theme-smoke] theme created:', { id: themeId, name: theme.name, keywordCount: themeKeywords.length });

  let insertedTotal = 0;
  for (const keyword of themeKeywords) {
    console.log(`[xhs-theme-smoke] capturing keyword="${keyword.value}" limit=${limit}...`);
    const result = await runCapture(keyword.id, limit);
    insertedTotal += result?.inserted ?? 0;
    const stats = getTopicStats(keyword.id);
    console.log('[xhs-theme-smoke] capture result:', {
      keyword: keyword.value,
      status: result?.status,
      inserted: result?.inserted,
      total: stats.total,
      sample: stats.sample
        ? {
            id: stats.sample.id,
            title: stats.sample.title,
            source_id: stats.sample.source_id,
            has_xsec_token: Boolean(stats.sample.xsec_token),
            url: stats.sample.url,
            created_at: stats.sample.created_at,
          }
        : null,
    });
  }

  console.log('[xhs-theme-smoke] done:', {
    themeId,
    keywords: themeKeywords.map((keyword) => keyword.value),
    insertedTotal,
  });
}

run().catch((error) => {
  console.error('[xhs-theme-smoke] failed:', error);
  process.exitCode = 1;
});

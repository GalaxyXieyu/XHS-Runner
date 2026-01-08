import { checkStatus, login, searchNotes } from '../services/xhs/localService';
import { fetchNoteDetail, fetchTopNotes, fetchUserNotes } from '../services/xhs/xhsClient';

const DEFAULT_KEYWORD = '小红书';
const DEFAULT_LIMIT = 5;

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function run() {
  if (!process.env.XHS_HEADLESS) {
    process.env.XHS_HEADLESS = 'false';
  }

  const keyword = process.env.XHS_TEST_KEYWORD || DEFAULT_KEYWORD;
  const limit = toNumber(process.env.XHS_TEST_LIMIT, DEFAULT_LIMIT);
  const noteId = process.env.XHS_TEST_NOTE_ID;
  const userId = process.env.XHS_TEST_USER_ID;
  const timeout = toNumber(process.env.XHS_LOGIN_TIMEOUT, 300);
  const skipLogin = process.env.XHS_SMOKE_SKIP_LOGIN === 'true';

  if (!skipLogin) {
    console.log('[xhs-smoke] starting login flow...');
    const loginResult = await login({ timeout });
    console.log('[xhs-smoke] login result:', loginResult);
  }

  console.log('[xhs-smoke] checking login status...');
  const status = await checkStatus();
  console.log('[xhs-smoke] status:', status);

  if (process.env.XHS_SMOKE_SHOW_RAW === 'true') {
    console.log('[xhs-smoke] raw feed sample:');
    const rawResult = await searchNotes(keyword);
    const sample = (rawResult as any)?.feeds?.[0];
    console.log(JSON.stringify(sample ?? null, null, 2));
  }

  console.log(`[xhs-smoke] fetching top notes for keyword=\"${keyword}\" limit=${limit}...`);
  const notes = await fetchTopNotes(keyword, limit);
  console.log('[xhs-smoke] fetched notes:', notes.slice(0, 3));

  if (noteId) {
    if (!process.env.XHS_MCP_XSEC_TOKEN) {
      console.warn('[xhs-smoke] XHS_MCP_XSEC_TOKEN missing, skip fetchNoteDetail');
    } else {
      console.log(`[xhs-smoke] fetching note detail for noteId=${noteId}...`);
      const detail = await fetchNoteDetail(noteId, { xsecToken: process.env.XHS_MCP_XSEC_TOKEN });
      const detailAny = detail as any;
      console.log('[xhs-smoke] note detail:', {
        id: detailAny?.id,
        title: detailAny?.title,
        author: detailAny?.author_name,
      });
    }
  }

  if (userId) {
    console.log(`[xhs-smoke] fetching user notes for userId=${userId}...`);
    const userNotes = await fetchUserNotes(userId, limit);
    console.log('[xhs-smoke] user notes:', userNotes.slice(0, 3));
  }
}

run().catch((error) => {
  console.error('[xhs-smoke] failed:', error);
  process.exitCode = 1;
});

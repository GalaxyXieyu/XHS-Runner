import {
  commentOnNote as commentOnNoteLocal,
  deleteNote as deleteNoteLocal,
  getNoteDetail as getNoteDetailLocal,
  getUserNotes as getUserNotesLocal,
  publishContent as publishContentLocal,
  searchNotes as searchNotesLocal,
} from '../integration/localService';

const DEFAULT_LIMIT = 50;

let loggedDriver: string | null = null;

const SUPPORTED_DRIVERS = new Set(['local', 'mock']);

type NormalizedNote = {
  id: string;
  note_id?: string | null;
  title: string;
  url?: string | null;
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
};

function normalizeDriver(value?: string | null) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!SUPPORTED_DRIVERS.has(normalized)) {
    console.warn(`[xhsClient] unknown driver \"${value}\", fallback to local`);
    return 'local';
  }
  return normalized;
}

function resolveDriver() {
  const driver = normalizeDriver(process.env.XHS_MCP_DRIVER);
  if (driver) {
    return driver;
  }
  const legacyMode = process.env.XHS_MCP_MODE;
  if (legacyMode && legacyMode !== 'mock') {
    console.warn('[xhsClient] XHS_MCP_MODE legacy path removed, using local');
  }
  return legacyMode === 'mock' ? 'mock' : 'local';
}

function logDriver(driver: string) {
  if (loggedDriver === driver) {
    return;
  }
  loggedDriver = driver;
  console.info(`[xhsClient] using driver: ${driver}`);
}

function parseCount(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (text.includes('万')) {
    const parsed = Number.parseFloat(text.replace('万', ''));
    return Number.isFinite(parsed) ? Math.round(parsed * 10000) : null;
  }
  const parsed = Number.parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function extractNoteCard(item: any) {
  return item?.noteCard || item?.note_card || item?.note || item?.card || null;
}

function extractTags(noteCard: any) {
  const rawTags = noteCard?.tagList || noteCard?.tags || noteCard?.tag_list || null;
  if (!rawTags) {
    return null;
  }
  if (Array.isArray(rawTags)) {
    const list = rawTags
      .map((tag) => {
        if (!tag) {
          return null;
        }
        if (typeof tag === 'string') {
          return tag.trim();
        }
        return tag.name || tag.tagName || tag.text || tag.title || tag.tag || null;
      })
      .filter(Boolean) as string[];
    return list.length ? list : null;
  }
  if (typeof rawTags === 'string') {
    const trimmed = rawTags.trim();
    return trimmed ? [trimmed] : null;
  }
  return null;
}

function extractMediaUrls(noteCard: any, item: any) {
  const rawList =
    noteCard?.imageList ||
    noteCard?.images ||
    item?.imageList ||
    item?.images ||
    item?.image_list ||
    [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return null;
  }
  const urls = rawList
    .map((entry) => {
      if (!entry) {
        return null;
      }
      const infoList = entry.infoList || entry.info_list || [];
      const preferred =
        infoList.find((info: any) => info?.imageScene === 'WB_DFT') || infoList[0] || null;
      return (
        preferred?.url ||
        entry.url ||
        entry.urlDefault ||
        entry.urlPre ||
        entry.url_default ||
        entry.url_pre ||
        null
      );
    })
    .filter(Boolean) as string[];
  return urls.length ? urls : null;
}

function resolvePublishedAt(noteCard: any, item: any) {
  const cornerTags = noteCard?.cornerTagInfo || noteCard?.cornerTagInfos || [];
  if (Array.isArray(cornerTags)) {
    const publishTag = cornerTags.find((tag) =>
      ['publish_time', 'publishTime', 'time', 'publish'].includes(tag?.type)
    );
    if (publishTag?.text) {
      return publishTag.text;
    }
  }
  const timestamp =
    noteCard?.publishTime ||
    noteCard?.publish_time ||
    noteCard?.time ||
    item?.publish_time ||
    item?.time ||
    null;
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof timestamp === 'string' && timestamp.trim()) {
    return timestamp.trim();
  }
  return null;
}

function normalizeNoteItem(item: any, index: number): NormalizedNote {
  const noteCard = extractNoteCard(item);
  const id = item?.id || item?.note_id || item?.noteId || noteCard?.id || noteCard?.noteId || `${index}`;
  const title =
    noteCard?.displayTitle ||
    noteCard?.title ||
    item?.title ||
    item?.desc ||
    item?.name ||
    `Note ${index + 1}`;
  const rawUrl = item?.url || item?.link || item?.note_url || item?.noteUrl;
  const xsecToken =
    item?.xsecToken ||
    item?.xsec_token ||
    noteCard?.xsecToken ||
    noteCard?.xsec_token ||
    noteCard?.user?.xsecToken ||
    noteCard?.user?.xsec_token ||
    null;
  const url =
    rawUrl ||
    (id && xsecToken
      ? `https://www.xiaohongshu.com/explore/${id}?xsec_token=${encodeURIComponent(
          xsecToken
        )}&xsec_source=pc_feed`
      : null);
  const author = noteCard?.user || item?.user || {};
  const interact = noteCard?.interactInfo || noteCard?.interact_info || item?.interactInfo || item?.interact_info || {};

  return {
    id: String(id),
    note_id: noteCard?.noteId || noteCard?.id || item?.note_id || item?.noteId || String(id),
    title,
    url,
    xsec_token: xsecToken,
    desc: noteCard?.desc || noteCard?.description || item?.desc || item?.description || null,
    note_type: noteCard?.type || item?.note_type || item?.type || null,
    tags: extractTags(noteCard),
    cover_url:
      noteCard?.cover?.urlDefault ||
      noteCard?.cover?.urlPre ||
      noteCard?.cover?.url ||
      item?.cover_url ||
      item?.cover ||
      null,
    media_urls: extractMediaUrls(noteCard, item),
    author_id: author?.userId || author?.id || item?.author_id || item?.user_id || null,
    author_name:
      author?.nickname ||
      author?.nickName ||
      author?.name ||
      item?.author_name ||
      item?.user_name ||
      null,
    author_avatar_url: author?.avatar || author?.avatarUrl || item?.author_avatar_url || null,
    like_count: parseCount(interact?.likedCount || interact?.liked_count),
    collect_count: parseCount(interact?.collectedCount || interact?.collected_count),
    comment_count: parseCount(interact?.commentCount || interact?.comment_count),
    share_count: parseCount(interact?.sharedCount || interact?.share_count),
    published_at: resolvePublishedAt(noteCard, item),
    raw_json: item,
  };
}

function normalizeNotes(payload: any): NormalizedNote[] {
  const rawList =
    payload?.data?.list ||
    payload?.data ||
    payload?.result ||
    payload?.notes ||
    payload?.items ||
    [];

  return rawList.filter(Boolean).map((item: any, index: number) => normalizeNoteItem(item, index));
}

function normalizeNoteDetail(payload: any, context: { xsecToken?: string } = {}) {
  const note = payload?.data?.note || payload?.data || payload?.result || payload?.note || {};
  const noteCard = extractNoteCard(note);
  const normalized = normalizeNoteItem(noteCard ? { ...note, noteCard } : note, 0);
  const comments = payload?.data?.comments || payload?.comments || note.comments || [];
  return {
    ...normalized,
    xsec_token: normalized.xsec_token || context.xsecToken || null,
    comments,
    metrics: note?.interactInfo || note?.interact_info || null,
    raw: payload,
  };
}

function mockNotes(keyword: string, limit: number): NormalizedNote[] {
  return Array.from({ length: limit }, (_value, index) => ({
    id: `mock-${keyword}-${index + 1}`,
    title: `Mock note for ${keyword} #${index + 1}`,
    url: null,
    desc: null,
  }));
}

export async function fetchTopNotes(keyword: string, limit = DEFAULT_LIMIT) {
  const driver = resolveDriver();
  const capped = Math.min(limit, DEFAULT_LIMIT);

  logDriver(driver);

  if (driver === 'mock') {
    return mockNotes(keyword, capped);
  }

  const result = await searchNotesLocal(keyword);
  const feeds = result?.feeds || [];
  return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
}

export async function fetchUserNotes(userId: string, limit = DEFAULT_LIMIT) {
  const driver = resolveDriver();
  const capped = Math.min(limit, DEFAULT_LIMIT);

  logDriver(driver);

  if (driver === 'mock') {
    return Array.from({ length: capped }, (_value, index) => ({
      id: `mock-user-${userId}-${index + 1}`,
      title: `Mock competitor note #${index + 1}`,
      url: null,
    }));
  }

  const result = await getUserNotesLocal(capped);
  const feeds = result?.data || [];
  return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
}

export async function fetchNoteDetail(noteId: string, options: Record<string, any> = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return {
      id: noteId,
      title: `Mock note ${noteId}`,
      desc: '',
      comments: [],
      raw: { mode: 'mock' },
    };
  }
  const detail = await getNoteDetailLocal(noteId, options);
  const rawDetail = detail?.detail || detail;
  return normalizeNoteDetail(
    {
      data: { note: rawDetail, comments: (rawDetail as any)?.comments || [] },
      result: rawDetail,
      note: rawDetail,
    },
    { xsecToken: options?.xsecToken }
  );
}

export async function publishContent(payload: Record<string, any>, options: Record<string, any> = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', payload };
  }

  return publishContentLocal(payload, options);
}

export async function commentOnNote(noteId: string, content: string, options: Record<string, any> = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId, content };
  }

  return commentOnNoteLocal(noteId, content, options);
}

export async function deleteNote(noteId: string, options: Record<string, any> = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId };
  }

  return deleteNoteLocal(noteId, options);
}

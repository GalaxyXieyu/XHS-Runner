import {
  commentOnNote as commentOnNoteLocal,
  deleteNote as deleteNoteLocal,
  getNoteDetail as getNoteDetailLocal,
  getUserNotes as getUserNotesLocal,
  publishContent as publishContentLocal,
  searchNotes as searchNotesLocal,
} from './localService';

const DEFAULT_LIMIT = 50;

let loggedDriver: string | null = null;

const SUPPORTED_DRIVERS = new Set(['local', 'mock']);

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

function normalizeNotes(payload: any) {
  const rawList =
    payload?.data?.list ||
    payload?.data ||
    payload?.result ||
    payload?.notes ||
    payload?.items ||
    [];

  return rawList
    .filter(Boolean)
    .map((item: any, index: number) => {
      const id = item.id || item.note_id || item.noteId || `${index}`;
      const title = item.title || item.desc || item.name || `Note ${index + 1}`;
      const url = item.url || item.link || item.note_url || null;
      return { id: String(id), title, url };
    });
}

function normalizeNoteDetail(payload: any) {
  const note = payload?.data?.note || payload?.data || payload?.result || payload?.note || {};
  const comments = payload?.data?.comments || payload?.comments || note.comments || [];
  return {
    id: note.id || note.note_id || note.noteId || null,
    title: note.title || note.desc || note.name || null,
    desc: note.desc || note.description || null,
    note_type: note.note_type || note.type || null,
    tags: note.tags || note.tag_list || null,
    cover_url: note.cover_url || note.cover || null,
    media_urls: note.media_urls || note.images || note.videos || null,
    author_id: note.author_id || note.user_id || null,
    author_name: note.author_name || note.user_name || null,
    author_avatar_url: note.author_avatar_url || note.user_avatar || null,
    metrics: note.metrics || null,
    comments,
    raw: payload,
  };
}

function mockNotes(keyword: string, limit: number) {
  return Array.from({ length: limit }, (_value, index) => ({
    id: `mock-${keyword}-${index + 1}`,
    title: `Mock note for ${keyword} #${index + 1}`,
    url: null,
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
  return normalizeNoteDetail({
    data: { note: rawDetail, comments: rawDetail?.comments || [] },
    result: rawDetail,
    note: rawDetail,
  });
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

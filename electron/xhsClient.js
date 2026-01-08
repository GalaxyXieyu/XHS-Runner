const DEFAULT_LIMIT = 50;
const localService = require('./mcp/localService');

let loggedDriver = null;

const SUPPORTED_DRIVERS = new Set(['local', 'mock']);

function normalizeDriver(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!SUPPORTED_DRIVERS.has(normalized)) {
    console.warn(`[xhsClient] unknown driver "${value}", fallback to local`);
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

function logDriver(driver) {
  if (loggedDriver === driver) {
    return;
  }
  loggedDriver = driver;
  console.info(`[xhsClient] using driver: ${driver}`);
}

function normalizeNotes(payload) {
  const rawList =
    payload?.data?.list ||
    payload?.data ||
    payload?.result ||
    payload?.notes ||
    payload?.items ||
    [];

  return rawList
    .filter(Boolean)
    .map((item, index) => {
      const id = item.id || item.note_id || item.noteId || `${index}`;
      const title = item.title || item.desc || item.name || `Note ${index + 1}`;
      const url = item.url || item.link || item.note_url || null;
      return { id: String(id), title, url };
    });
}

function normalizeNoteDetail(payload) {
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

function mockNotes(keyword, limit) {
  return Array.from({ length: limit }, (_, index) => ({
    id: `mock-${keyword}-${index + 1}`,
    title: `Mock note for ${keyword} #${index + 1}`,
    url: null,
  }));
}


async function fetchTopNotes(keyword, limit = DEFAULT_LIMIT) {
  const driver = resolveDriver();
  const capped = Math.min(limit, DEFAULT_LIMIT);

  logDriver(driver);

  if (driver === 'mock') {
    return mockNotes(keyword, capped);
  }

  const result = await localService.searchNotes(keyword);
  const feeds = result?.feeds || [];
  return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
}

async function fetchUserNotes(userId, limit = DEFAULT_LIMIT) {
  const driver = resolveDriver();
  const capped = Math.min(limit, DEFAULT_LIMIT);

  logDriver(driver);

  if (driver === 'mock') {
    return Array.from({ length: capped }, (_, index) => ({
      id: `mock-user-${userId}-${index + 1}`,
      title: `Mock competitor note #${index + 1}`,
      url: null,
    }));
  }

  const result = await localService.getUserNotes(capped);
  const feeds = result?.data || [];
  return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
}

async function fetchNoteDetail(noteId, options = {}) {
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
  const detail = await localService.getNoteDetail(noteId, options);
  const rawDetail = detail?.detail || detail;
  return normalizeNoteDetail({
    data: { note: rawDetail, comments: rawDetail?.comments || [] },
    result: rawDetail,
    note: rawDetail,
  });
}

async function publishContent(payload, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', payload };
  }

  return localService.publishContent(payload, options);
}

async function commentOnNote(noteId, content, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId, content };
  }

  return localService.commentOnNote(noteId, content, options);
}

async function deleteNote(noteId, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId };
  }

  return localService.deleteNote(noteId, options);
}

module.exports = {
  commentOnNote,
  deleteNote,
  fetchNoteDetail,
  fetchTopNotes,
  fetchUserNotes,
  publishContent,
};

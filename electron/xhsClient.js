const DEFAULT_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = Number(process.env.XHS_MCP_TIMEOUT_MS || 15000);
const localService = require('./mcp/localService');

let loggedDriver = null;

function resolveDriver() {
  const driver = process.env.XHS_MCP_DRIVER;
  if (driver) {
    return driver;
  }
  const mode = process.env.XHS_MCP_MODE || 'mcp';
  if (mode === 'mock') {
    return 'mock';
  }
  if (mode === 'mcp') {
    return 'legacy';
  }
  return mode;
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

async function fetchWithTimeout(url, options, timeoutMs) {
  if (!timeoutMs) {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callMcpTool(tool, args) {
  const endpoint = process.env.XHS_MCP_ENDPOINT;
  if (!endpoint) {
    throw new Error('XHS_MCP_ENDPOINT is not configured');
  }

  const payload = {
    tool,
    arguments: args || {},
  };

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`XHS MCP request failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function fetchTopNotes(keyword, limit = DEFAULT_LIMIT) {
  const driver = resolveDriver();
  const capped = Math.min(limit, DEFAULT_LIMIT);

  logDriver(driver);

  if (driver === 'mock') {
    return mockNotes(keyword, capped);
  }

  if (driver === 'local') {
    const result = await localService.searchNotes(keyword);
    const feeds = result?.feeds || [];
    return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
  }

  const tool =
    process.env.XHS_MCP_TOOL_SEARCH ||
    process.env.XHS_MCP_TOOL ||
    'xhs_search_note';
  const data = await callMcpTool(tool, { keyword, limit: capped });
  return normalizeNotes(data).slice(0, capped);
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

  if (driver === 'local') {
    const result = await localService.getUserNotes(capped);
    const feeds = result?.data || [];
    return normalizeNotes({ data: { list: feeds } }).slice(0, capped);
  }

  const tool = process.env.XHS_MCP_TOOL_USER_NOTES || 'xhs_get_user_notes';
  const data = await callMcpTool(tool, { user_id: userId, limit: capped });
  return normalizeNotes(data).slice(0, capped);
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
  if (driver === 'local') {
    const detail = await localService.getNoteDetail(noteId, options);
    const rawDetail = detail?.detail || detail;
    return normalizeNoteDetail({
      data: { note: rawDetail, comments: rawDetail?.comments || [] },
      result: rawDetail,
      note: rawDetail,
    });
  }

  const tool = process.env.XHS_MCP_TOOL_NOTE_DETAIL || 'xhs_get_note_detail';
  const data = await callMcpTool(tool, { note_id: noteId });
  return normalizeNoteDetail(data);
}

async function publishContent(payload, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', payload };
  }

  if (driver === 'local') {
    return localService.publishContent(payload, options);
  }

  const tool = process.env.XHS_MCP_TOOL_PUBLISH || 'xhs_publish_content';
  return callMcpTool(tool, payload);
}

async function commentOnNote(noteId, content, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId, content };
  }

  if (driver === 'local') {
    return localService.commentOnNote(noteId, content, options);
  }

  const tool = process.env.XHS_MCP_TOOL_COMMENT || 'xhs_comment_on_note';
  return callMcpTool(tool, { note_id: noteId, content });
}

async function deleteNote(noteId, options = {}) {
  const driver = resolveDriver();
  logDriver(driver);

  if (driver === 'mock') {
    return { status: 'mocked', note_id: noteId };
  }

  if (driver === 'local') {
    return localService.deleteNote(noteId, options);
  }

  const tool = process.env.XHS_MCP_TOOL_DELETE || 'xhs_delete_note';
  return callMcpTool(tool, { note_id: noteId });
}

module.exports = {
  commentOnNote,
  deleteNote,
  fetchNoteDetail,
  fetchTopNotes,
  fetchUserNotes,
  publishContent,
};

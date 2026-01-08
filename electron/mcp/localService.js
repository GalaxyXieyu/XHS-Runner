const path = require('path');
const { pathToFileURL } = require('url');

const LOCAL_DIST_ENTRY = path.resolve(
  __dirname,
  '..',
  '..',
  'xhs-mcp',
  'dist',
  'xhs-mcp.js'
);

let cachedServices = null;

async function loadXhsModule() {
  try {
    return await import(pathToFileURL(LOCAL_DIST_ENTRY).href);
  } catch (error) {
    const message =
      'xhs-mcp dist not found. Build it with: npm --prefix xhs-mcp install && npm --prefix xhs-mcp run build.';
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function getServices() {
  if (cachedServices) {
    return cachedServices;
  }

  const module = await loadXhsModule();
  const { getConfig, AuthService, FeedService, PublishService, NoteService, DeleteService } = module;
  if (!getConfig || !FeedService || !PublishService || !NoteService) {
    throw new Error('xhs-mcp exports missing expected core services');
  }

  const config = getConfig();
  cachedServices = {
    authService: new AuthService(config),
    feedService: new FeedService(config),
    publishService: new PublishService(config),
    noteService: new NoteService(config),
    deleteService: DeleteService ? new DeleteService(config) : null,
  };

  return cachedServices;
}

function resolveBrowserPath(options) {
  return options?.browserPath || process.env.XHS_BROWSER_PATH || undefined;
}

function resolveXsecToken(options) {
  return options?.xsecToken || process.env.XHS_MCP_XSEC_TOKEN || undefined;
}

async function searchNotes(keyword, options = {}) {
  const { feedService } = await getServices();
  return feedService.searchFeeds(keyword, resolveBrowserPath(options));
}

async function getUserNotes(limit, options = {}) {
  const { noteService } = await getServices();
  return noteService.getUserNotes(limit, options?.cursor, resolveBrowserPath(options));
}

async function getNoteDetail(noteId, options = {}) {
  const { feedService } = await getServices();
  const token = resolveXsecToken(options);
  if (!token) {
    throw new Error('xsec_token is required for note detail in local mode');
  }
  return feedService.getFeedDetail(noteId, token, resolveBrowserPath(options));
}

async function publishContent(payload, options = {}) {
  const { publishService } = await getServices();
  const { type, title, content, media_paths, mediaPaths, tags } = payload || {};
  const resolvedMedia = media_paths || mediaPaths || [];
  return publishService.publishContent(
    type,
    title,
    content,
    resolvedMedia,
    tags,
    resolveBrowserPath(options)
  );
}

async function commentOnNote(noteId, content, options = {}) {
  const { feedService } = await getServices();
  const token = resolveXsecToken(options);
  if (!token) {
    throw new Error('xsec_token is required for comment in local mode');
  }
  return feedService.commentOnFeed(noteId, token, content, resolveBrowserPath(options));
}

async function deleteNote(noteId, options = {}) {
  const { noteService } = await getServices();
  return noteService.deleteNote(noteId, resolveBrowserPath(options));
}

module.exports = {
  commentOnNote,
  deleteNote,
  getNoteDetail,
  getUserNotes,
  publishContent,
  searchNotes,
};

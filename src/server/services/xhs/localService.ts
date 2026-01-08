import path from 'path';

const LOCAL_DIST_ENTRY = path.resolve(__dirname, '../../../mcp/xhs-core/dist/index.js');

let cachedServices: any = null;

function loadXhsModule() {
  try {
    return require(LOCAL_DIST_ENTRY);
  } catch (error: any) {
    const message = 'xhs-core dist not found. Build it with: npm run build:xhs-core.';
    const wrapped = new Error(message) as Error & { cause?: unknown };
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

function resolveBrowserPath(options?: { browserPath?: string }) {
  return options?.browserPath || process.env.XHS_BROWSER_PATH || undefined;
}

function resolveXsecToken(options?: { xsecToken?: string }) {
  return options?.xsecToken || process.env.XHS_MCP_XSEC_TOKEN || undefined;
}

export async function searchNotes(keyword: string, options: { browserPath?: string } = {}) {
  const { feedService } = await getServices();
  return feedService.searchFeeds(keyword, resolveBrowserPath(options));
}

export async function getUserNotes(limit: number, options: { cursor?: string; browserPath?: string } = {}) {
  const { noteService } = await getServices();
  return noteService.getUserNotes(limit, options?.cursor, resolveBrowserPath(options));
}

export async function getNoteDetail(noteId: string, options: { xsecToken?: string; browserPath?: string } = {}) {
  const { feedService } = await getServices();
  const token = resolveXsecToken(options);
  if (!token) {
    throw new Error('xsec_token is required for note detail in local mode');
  }
  return feedService.getFeedDetail(noteId, token, resolveBrowserPath(options));
}

export async function publishContent(
  payload: Record<string, any>,
  options: { browserPath?: string } = {}
) {
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

export async function commentOnNote(
  noteId: string,
  content: string,
  options: { xsecToken?: string; browserPath?: string } = {}
) {
  const { feedService } = await getServices();
  const token = resolveXsecToken(options);
  if (!token) {
    throw new Error('xsec_token is required for comment in local mode');
  }
  return feedService.commentOnFeed(noteId, token, content, resolveBrowserPath(options));
}

export async function deleteNote(noteId: string, options: { browserPath?: string } = {}) {
  const { noteService } = await getServices();
  return noteService.deleteNote(noteId, resolveBrowserPath(options));
}

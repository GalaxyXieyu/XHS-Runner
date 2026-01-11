import path from 'path';

// Support both Electron (electron/mcp) and Next.js (process.cwd()) contexts
const LOCAL_DIST_ENTRY = path.resolve(process.cwd(), 'electron/mcp/xhs-core/dist/index.js');

let cachedServices: any = null;

// Use eval to bypass webpack's static analysis of require
const dynamicRequire = eval('require');

function loadXhsModule() {
  try {
    return dynamicRequire(LOCAL_DIST_ENTRY);
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

export async function login(options: { browserPath?: string; timeout?: number } = {}) {
  const { authService } = await getServices();
  return authService.login(resolveBrowserPath(options), options.timeout);
}

export async function checkStatus(options: { browserPath?: string } = {}) {
  const { authService } = await getServices();
  return authService.checkStatus(resolveBrowserPath(options));
}

export async function logout() {
  const { authService } = await getServices();
  return authService.logout();
}

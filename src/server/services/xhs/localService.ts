/**
 * Local XHS service - direct import without MCP protocol
 */

import { getConfig } from './shared/config';
import { AuthService } from './core/auth';
import { FeedService } from './core/feeds';
import { PublishService } from './core/publishing';
import { NoteService } from './core/notes';
import { DeleteService } from './core/deleting';

const config = getConfig();

const authService = new AuthService(config);
const feedService = new FeedService(config);
const publishService = new PublishService(config);
const noteService = new NoteService(config);
const deleteService = new DeleteService(config);

function resolveBrowserPath(options?: { browserPath?: string }) {
  return options?.browserPath || process.env.XHS_BROWSER_PATH || undefined;
}

function resolveXsecToken(options?: { xsecToken?: string }) {
  return options?.xsecToken || process.env.XHS_MCP_XSEC_TOKEN || undefined;
}

export async function searchNotes(keyword: string, options: { browserPath?: string } = {}) {
  return feedService.searchFeeds(keyword, resolveBrowserPath(options));
}

export async function getUserNotes(limit: number, options: { cursor?: string; browserPath?: string } = {}) {
  return noteService.getUserNotes(limit, options?.cursor, resolveBrowserPath(options));
}

export async function getNoteDetail(noteId: string, options: { xsecToken?: string; browserPath?: string } = {}) {
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
  const token = resolveXsecToken(options);
  if (!token) {
    throw new Error('xsec_token is required for comment in local mode');
  }
  return feedService.commentOnFeed(noteId, token, content, resolveBrowserPath(options));
}

export async function deleteNote(noteId: string, options: { browserPath?: string } = {}) {
  return noteService.deleteNote(noteId, resolveBrowserPath(options));
}

export async function login(options: { browserPath?: string; timeout?: number } = {}) {
  return authService.login(resolveBrowserPath(options), options.timeout);
}

export async function checkStatus(options: { browserPath?: string } = {}) {
  return authService.checkStatus(resolveBrowserPath(options));
}

export async function logout() {
  return authService.logout();
}

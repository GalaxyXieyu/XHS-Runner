/**
 * Feed operations service for XHS MCP Server
 */

import {
  Config,
  FeedListResult,
  SearchResult,
  FeedDetailResult,
  CommentResult,
  FeedItem,
} from '../../shared/types';
import {
  FeedError,
  FeedParsingError,
  FeedNotFoundError,
  NotLoggedInError,
  XHSError,
} from '../../shared/errors';
import { BaseService } from '../../shared/base.service';
import {
  makeSearchUrl,
  makeFeedDetailUrl,
  extractInitialState,
  isLoggedIn,
} from '../../shared/xhs.utils';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';

export class FeedService extends BaseService {
  constructor(config: Config) {
    super(config);
  }

  async getFeedList(browserPath?: string): Promise<FeedListResult> {
    try {
      const page = await this.getBrowserManager().createPage(true, browserPath, true);

      try {
        await this.getBrowserManager().navigateWithRetry(page, this.getConfig().xhs.homeUrl);
        await sleep(1000);

        // Check if logged in
        if (!(await isLoggedIn(page))) {
          throw new NotLoggedInError('Must be logged in to access feed list', {
            operation: 'get_feed_list',
          });
        }

        // Extract feed data using a more targeted approach
        let feedData: string | null = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts && !feedData) {
          await sleep(2000); // Wait 2 seconds between attempts
          attempts++;

          feedData = (await page.evaluate(`
            (() => {
              if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.feed && window.__INITIAL_STATE__.feed.feeds && window.__INITIAL_STATE__.feed.feeds._value) {
                try {
                  // Try to serialize just the feeds data to avoid circular reference issues
                  const feedsData = window.__INITIAL_STATE__.feed.feeds._value;
                  return JSON.stringify(feedsData);
                } catch (e) {
                  logger.warn('Failed to serialize feeds data:', e.message);
                  return null;
                }
              }
              return null;
            })()
          `)) as string | null;

          if (feedData) {
            logger.info(`Feed results loaded after ${attempts} attempts`);
            break;
          }
        }

        if (!feedData) {
          throw new FeedParsingError(
            `Could not extract feed data after ${maxAttempts} attempts. The page may not be fully loaded or the state structure has changed.`,
            {
              url: this.getConfig().xhs.homeUrl,
              suggestion: 'Try logging in first using xhs_auth_login tool',
            }
          );
        }

        const feedsValue = JSON.parse(feedData) as unknown[];

        return {
          success: true,
          feeds: feedsValue as FeedItem[],
          count: feedsValue.length,
          source: 'home_page',
          url: this.getConfig().xhs.homeUrl,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      if (error instanceof NotLoggedInError || error instanceof FeedParsingError) {
        throw error;
      }
      logger.error(`Failed to get feed list: ${error}`);
      throw new XHSError(
        `Failed to get feed list: ${error}`,
        'GetFeedListError',
        {},
        error as Error
      );
    }
  }

  async searchFeeds(keyword: string, browserPath?: string): Promise<SearchResult> {
    if (!keyword || !keyword.trim()) {
      throw new FeedError('Search keyword cannot be empty');
    }

    const trimmedKeyword = keyword.trim();

    try {
      const page = await this.getBrowserManager().createPage(true, browserPath, true);

      try {
        const searchUrl = makeSearchUrl(trimmedKeyword);
        await this.getBrowserManager().navigateWithRetry(page, searchUrl);

        // Wait for page to stabilize after navigation
        await sleep(3000);

        // Wait for search results to load with multiple attempts
        let searchData: string | null = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts && !searchData) {
          await sleep(2000); // Wait 2 seconds between attempts
          attempts++;

          try {
            // Check if page is still valid before evaluate
            const currentUrl = page.url();
            if (!currentUrl.includes('search_result')) {
              logger.warn(`Page navigated away from search, current URL: ${currentUrl}`);
              // Re-navigate to search URL
              await this.getBrowserManager().navigateWithRetry(page, searchUrl);
              await sleep(3000);
              continue;
            }

            searchData = (await page.evaluate(`
              (() => {
                if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.search && window.__INITIAL_STATE__.search.feeds && window.__INITIAL_STATE__.search.feeds._value) {
                  try {
                    const feedsData = window.__INITIAL_STATE__.search.feeds._value;
                    return JSON.stringify(feedsData);
                  } catch (e) {
                    console.warn('Failed to serialize feeds data:', e.message);
                    return null;
                  }
                }
                return null;
              })()
            `)) as string | null;

            if (searchData) {
              logger.info(`Search results loaded after ${attempts} attempts`);
              break;
            }
          } catch (evalError: unknown) {
            const errorMessage = evalError instanceof Error ? evalError.message : String(evalError);
            // Handle execution context destroyed error
            if (errorMessage.includes('Execution context was destroyed')) {
              logger.warn(`Execution context destroyed on attempt ${attempts}, waiting for page to stabilize...`);
              await sleep(3000);
              continue;
            }
            throw evalError;
          }
        }

        if (!searchData) {
          throw new FeedParsingError(
            `Could not extract search results for keyword: ${trimmedKeyword} after ${maxAttempts} attempts`,
            {
              keyword: trimmedKeyword,
              url: searchUrl,
            }
          );
        }

        const feedsValue = JSON.parse(searchData) as unknown[];

        return {
          success: true,
          keyword: trimmedKeyword,
          feeds: feedsValue as FeedItem[],
          count: feedsValue.length,
          searchUrl,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      if (error instanceof FeedError) {
        throw error;
      }
      logger.error(`Feed search failed for keyword '${trimmedKeyword}': ${error}`);
      throw new XHSError(
        `Feed search failed: ${error}`,
        'SearchFeedsError',
        { keyword: trimmedKeyword },
        error as Error
      );
    }
  }

  async getFeedDetail(
    feedId: string,
    xsecToken: string,
    browserPath?: string
  ): Promise<FeedDetailResult> {
    if (!feedId || !xsecToken) {
      throw new FeedError('Both feed_id and xsec_token are required');
    }

    try {
      const page = await this.getBrowserManager().createPage(true, browserPath, true);

      try {
        const detailUrl = makeFeedDetailUrl(feedId, xsecToken);
        await this.getBrowserManager().navigateWithRetry(page, detailUrl);
        await sleep(2000);

        // Try extracting from __INITIAL_STATE__ first
        const state = await extractInitialState(page);
        const noteData = state?.note as Record<string, unknown>;

        if (noteData?.noteDetailMap) {
          const noteDetailMap = noteData.noteDetailMap as Record<string, unknown>;
          if (feedId in noteDetailMap) {
            const detail = noteDetailMap[feedId] as Record<string, unknown>;
            return { success: true, feedId, detail, url: detailUrl };
          }
        }

        // Fallback: extract from DOM directly
        const domDetail = await page.evaluate(() => {
          const result: Record<string, unknown> = {};

          // Title - look for note title specifically (expanded selectors)
          const titleEl = document.querySelector('#detail-title, .note-content .title, [class*="noteDetail"] [class*="title"], .title, h1[class*="title"]');
          if (titleEl) result.title = titleEl.textContent?.trim();

          // Description/content - use specific selectors to avoid matching notification text
          // Priority: 1) #detail-desc 2) note-text class 3) meta description
          const descEl = document.querySelector('#detail-desc, .note-text, .note-content .desc, [class*="noteDetail"] [class*="desc"], .desc, [class*="content"]');
          if (descEl) {
            const text = descEl.textContent?.trim();
            // Filter out notification-like text (very short or contains "通知")
            if (text && text.length > 10 && !text.includes('通知')) {
              result.desc = text;
            }
          }

          // Fallback to meta tag if no valid desc found
          if (!result.desc) {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
              result.desc = metaDesc.getAttribute('content');
            }
          }

          // Additional fallback: og:description
          if (!result.desc) {
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) {
              result.desc = ogDesc.getAttribute('content');
            }
          }

          // Author
          const authorEl = document.querySelector('.author-wrapper .username, [class*="author"] [class*="name"]');
          if (authorEl) result.authorName = authorEl.textContent?.trim();

          // Interaction counts
          const likeEl = document.querySelector('[class*="like"] [class*="count"], .like-wrapper .count');
          if (likeEl) result.likeCount = likeEl.textContent?.trim();

          const collectEl = document.querySelector('[class*="collect"] [class*="count"], .collect-wrapper .count');
          if (collectEl) result.collectCount = collectEl.textContent?.trim();

          const commentEl = document.querySelector('[class*="chat"] [class*="count"], .chat-wrapper .count');
          if (commentEl) result.commentCount = commentEl.textContent?.trim();

          return result;
        });

        if (domDetail && (domDetail.desc || domDetail.title)) {
          return {
            success: true,
            feedId,
            detail: domDetail,
            url: detailUrl,
          };
        }

        // Debug: 打印页面源内容帮助调试
        const debugInfo = await page.evaluate(() => {
          const html = document.documentElement.outerHTML;
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content');
          const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
          const bodyText = document.body?.innerText?.slice(0, 2000);
          return { metaDesc, ogDesc, bodyText, htmlLength: html.length };
        });
        logger.warn(`[FeedService] Failed to extract for ${feedId}, debug info:`, JSON.stringify(debugInfo, null, 2));

        throw new FeedParsingError(`Could not extract note details for feed: ${feedId}`, {
          feedId,
          url: detailUrl,
        });
      } finally {
        await page.close();
      }
    } catch (error) {
      if (
        error instanceof FeedError ||
        error instanceof FeedNotFoundError ||
        error instanceof FeedParsingError
      ) {
        throw error;
      }
      logger.error(`Failed to get feed detail for ${feedId}: ${error}`);
      throw new XHSError(
        `Failed to get feed detail: ${error}`,
        'GetFeedDetailError',
        { feedId },
        error as Error
      );
    }
  }

  async commentOnFeed(
    feedId: string,
    xsecToken: string,
    note: string,
    browserPath?: string
  ): Promise<CommentResult> {
    if (!feedId || !xsecToken || !note) {
      throw new FeedError('feed_id, xsec_token, and note are all required');
    }

    if (note.trim().length === 0) {
      throw new FeedError('Comment note cannot be empty');
    }

    try {
      const page = await this.getBrowserManager().createPage(false, browserPath, true);

      try {
        const detailUrl = makeFeedDetailUrl(feedId, xsecToken);
        await this.getBrowserManager().navigateWithRetry(page, detailUrl);
        await sleep(1000);

        // Check if logged in
        if (!(await isLoggedIn(page))) {
          throw new NotLoggedInError('Must be logged in to comment on feeds', {
            operation: 'comment_on_feed',
            feedId,
          });
        }

        // Click on comment input
        const commentInputSelector = 'div.input-box div.content-edit span';
        if (!(await this.getBrowserManager().tryWaitForSelector(page, commentInputSelector))) {
          throw new FeedError('Comment input not found on page', {
            feedId,
            selector: commentInputSelector,
          });
        }

        const commentInput = await page.$(commentInputSelector);
        if (commentInput) {
          await commentInput.click();
        }

        // Fill comment note
        const editorSelector = 'div.input-box div.content-edit p.content-input';
        const editor = await page.$(editorSelector);

        if (editor) {
          await editor.click();
          await editor.type(note, { delay: 30 });
        }
        await sleep(1000);

        // Submit comment
        const submitSelector = 'div.bottom button.submit';
        const submitButton = await page.$(submitSelector);
        if (submitButton) {
          await submitButton.click();
        }
        await sleep(2000); // Wait for submission

        return {
          success: true,
          message: 'Comment submitted successfully',
          feedId,
          note,
          url: detailUrl,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      if (error instanceof FeedError || error instanceof NotLoggedInError) {
        throw error;
      }
      logger.error(`Failed to comment on feed ${feedId}: ${error}`);
      throw new XHSError(
        `Failed to comment on feed: ${error}`,
        'CommentOnFeedError',
        { feedId },
        error as Error
      );
    }
  }
}

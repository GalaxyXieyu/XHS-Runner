import fs from 'fs';
import path from 'path';
import { join } from 'path';
import type { Page } from 'puppeteer';
import { PublishError, InvalidImageError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';
import { ImageDownloader } from '../../shared/image-downloader';
import { resolveUserDataPath } from '../../../../runtime/userDataPath';
import { COMMON_STATUS_SELECTORS, COMMON_TEXT_PATTERNS, COMMON_FILE_SELECTORS } from '../../shared/selectors';

// Constants for video publishing
export const VIDEO_TIMEOUTS = {
  PAGE_LOAD: 3000,
  TAB_SWITCH: 2000,
  VIDEO_PROCESSING: 10000,
  CONTENT_WAIT: 1000,
  UPLOAD_READY: 1000,
  UPLOAD_START: 3000,
  PROCESSING_CHECK: 3000,
  COMPLETION_CHECK: 2000,
  PROCESSING_TIMEOUT: 120000, // 2 minutes
  COMPLETION_TIMEOUT: 300000, // 5 minutes
} as const;

const SELECTORS = {
  FILE_INPUT: COMMON_FILE_SELECTORS.FILE_INPUT,
  SUCCESS_INDICATORS: COMMON_STATUS_SELECTORS.SUCCESS,
  ERROR_INDICATORS: COMMON_STATUS_SELECTORS.ERROR,
  PROCESSING_INDICATORS: COMMON_STATUS_SELECTORS.PROCESSING,
  COMPLETION_INDICATORS: [
    '.upload-complete',
    '.processing-complete',
    '.video-ready',
    '[class*="complete"]',
    '[class*="ready"]',
  ],
  TOAST_SELECTORS: COMMON_STATUS_SELECTORS.TOAST,
  PUBLISH_PAGE_INDICATORS: [
    'div.upload-content',
    'div.submit',
    '.creator-editor',
    '.video-upload-container',
    'input[type="file"]',
  ],
} as const;

const TEXT_PATTERNS = COMMON_TEXT_PATTERNS;

export async function dumpDebug(page: Page, label: string) {
  try {
    const dir = resolveUserDataPath('logs', 'xhs-publish-debug');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
    const base = path.join(dir, `${ts}-${safeLabel}`);

    await page.screenshot({ path: `${base}.png`, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(`${base}.html`, html, 'utf8');

    const url = page.url();
    fs.writeFileSync(`${base}.url.txt`, url, 'utf8');

    // Capture some key text to quickly spot login/overlay states.
    const text = await page.evaluate(() => {
      const s = document.body?.innerText || '';
      return s.slice(0, 8000);
    });
    fs.writeFileSync(`${base}.text.txt`, text, 'utf8');
  } catch (_e) {
    // Best effort only.
  }
}

export async function findElementBySelectors(
  page: Page,
  selectors: readonly string[]
): Promise<any | null> {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      logger.debug(`Found element with selector: ${selector}`);
      return element;
    }
  }
  return null;
}

export async function getElementText(element: Element): Promise<string | null> {
  try {
    return await (element as any).page().evaluate((el: Element) => el.textContent, element);
  } catch (error) {
    logger.warn(`Failed to get element text: ${error}`);
    return null;
  }
}

export async function checkTextPatterns(
  text: string | null,
  patterns: readonly string[]
): Promise<boolean> {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return patterns.some((pattern) => lowerText.includes(pattern.toLowerCase()));
}

export async function checkElementForPatterns(
  element: Element,
  patterns: readonly string[]
): Promise<boolean> {
  const text = await getElementText(element);
  return checkTextPatterns(text, patterns);
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout: number,
  checkInterval: number = 1000,
  errorMessage: string
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(checkInterval);
  }

  throw new PublishError(errorMessage);
}

export async function validateAndResolveImagePaths(
  imageDownloader: ImageDownloader,
  imagePaths: string[]
): Promise<string[]> {
  // Use ImageDownloader to process paths (downloads URLs, validates local paths)
  const resolvedPaths = await imageDownloader.processImagePaths(imagePaths);

  // Validate resolved paths
  for (const resolvedPath of resolvedPaths) {
    // For local paths that aren't absolute, resolve them
    const fullPath =
      resolvedPath.startsWith('/') || resolvedPath.match(/^[a-zA-Z]:/)
        ? resolvedPath
        : join(process.cwd(), resolvedPath);

    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (_error) {
      throw new InvalidImageError(`Image file not found: ${resolvedPath}`);
    }

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch (_error) {
      throw new InvalidImageError(`Image file not found: ${resolvedPath}`);
    }

    if (!stats.isFile()) {
      throw new InvalidImageError(`Path is not a file: ${resolvedPath}`);
    }

    // Check file extension
    const ext = resolvedPath.toLowerCase().split('.').pop();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    if (!ext || !allowedExtensions.includes(ext)) {
      throw new InvalidImageError(
        `Unsupported image format: ${resolvedPath}. Supported: ${allowedExtensions.join(', ')}`
      );
    }
  }

  if (resolvedPaths.length > 18) {
    throw new PublishError('Maximum 18 images allowed');
  }

  return resolvedPaths;
}

export async function clickUploadTab(page: Page): Promise<void> {
  try {
    // Try multiple selectors for tabs
    const tabSelectors = [
      'div.creator-tab',
      '.creator-tab',
      '[role="tab"]',
      '.tab',
      'div[class*="tab"]',
    ];

    let tabs: any[] = [];
    for (const selector of tabSelectors) {
      const foundTabs = await page.$$(selector);
      if (foundTabs.length > 0) {
        tabs = foundTabs;
        break;
      }
    }

    if (tabs.length === 0) {
      // Try to find all clickable elements that might be tabs
      const allClickable = await page.$$('*');
      const possibleTabs: any[] = [];

      for (const element of allClickable.slice(0, 50)) {
        // Limit to first 50 elements
        try {
          const tagName = await page.evaluate((el) => el.tagName, element);
          const text = await page.evaluate((el) => el.textContent, element);
          const isVisible = await element.isIntersectingViewport();

          if (
            isVisible &&
            text &&
            (text.includes('上传视频') ||
              text.includes('上传图文') ||
              text.includes('写长文') ||
              text.includes('视频') ||
              text.includes('图文') ||
              text.includes('图片'))
          ) {
            possibleTabs.push({ element, text: text.trim() });
          }
        } catch (error) {
          // Ignore errors
        }
      }

      // Look for image/text upload tab
      for (const tab of possibleTabs) {
        if (
          tab.text.includes('上传图文') ||
          tab.text.includes('图文') ||
          tab.text.includes('图片')
        ) {
          await tab.element.click();
          await sleep(2000);
          return;
        }
      }

      return;
    }

    // Look for the "上传图文" (upload image/text) tab specifically
    let imageTextTab: any = null;
    const tabTexts: string[] = [];

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      try {
        const isVisible = await tab.isIntersectingViewport();
        if (!isVisible) continue;

        const text = await page.evaluate((el) => el.textContent, tab);
        if (text) {
          tabTexts.push(text.trim());
        }

        // Check if this is the image/text upload tab
        if (
          text &&
          (text.includes('上传图文') || text.includes('图文') || text.includes('图片'))
        ) {
          imageTextTab = tab;
          break;
        }
      } catch (error) {
        // Ignore individual tab errors
      }
    }

    if (imageTextTab) {
      await imageTextTab.click();
      await sleep(2000); // Wait for tab switch
    } else {
      // Fallback: click the second tab (usually image/text upload)
      const visibleTabs: any[] = [];
      for (const tab of tabs) {
        const isVisible = await tab.isIntersectingViewport();
        if (isVisible) {
          visibleTabs.push(tab);
        }
      }

      if (visibleTabs.length > 1) {
        await visibleTabs[1].click(); // Usually the second tab is image/text
        await sleep(2000);
      } else if (visibleTabs.length > 0) {
        await visibleTabs[0].click();
        await sleep(2000);
      }
    }
  } catch (error) {
    logger.warn(`Failed to click upload tab: ${error}`);
  }
}

export async function uploadImages(page: Page, imagePaths: string[]): Promise<void> {
  // Try primary file input selector
  let fileInput = await page.$('input[type=file]') as any;

  if (!fileInput) {
    // Fallback to alternative selector
    fileInput = await page.$('.upload-input') as any;

    if (!fileInput) {
      throw new PublishError('Could not find file upload input on page');
    }
  }

  // Upload each image
  for (const imagePath of imagePaths) {
    try {
      await fileInput.uploadFile(imagePath);
      await sleep(1500); // Wait between uploads
    } catch (error) {
      throw new PublishError(`Failed to upload image ${imagePath}: ${error}`);
    }
  }
}

export async function fillTitle(page: Page, title: string): Promise<void> {
  const titleSelectors = [
    'input[placeholder*="标题"]',
    'input[placeholder*="title"]',
    'input[data-placeholder*="标题"]',
    '.title-input input',
    'input[type="text"]',
  ];

  const titleInput = await findElementBySelectors(page, titleSelectors);
  if (!titleInput) {
    throw new PublishError('Could not find title input field');
  }

  await titleInput.click({ clickCount: 3 });
  await titleInput.type(title, { delay: 50 });
}

export async function findContentElement(page: Page): Promise<any | null> {
  const contentSelectors = [
    'div[contenteditable="true"]',
    '.content-input',
    '.editor-content',
    '[data-placeholder*="正文"]',
  ];

  return await findElementBySelectors(page, contentSelectors);
}

export async function findTextboxByPlaceholder(page: Page): Promise<any | null> {
  const placeholders = ['正文', '内容', '输入内容', '请输入'];

  for (const placeholder of placeholders) {
    const element = await page.$(`*[placeholder*="${placeholder}"]`);
    if (element) return element;
  }

  return null;
}

export async function findTextboxParent(page: Page, element: Element): Promise<any> {
  try {
    const parent = await page.evaluateHandle((el: Element) => {
      let current: any = el;
      while (current && current.parentElement) {
        if (current.getAttribute('contenteditable') === 'true') {
          return current;
        }
        current = current.parentElement;
      }
      return el;
    }, element);
    return parent;
  } catch (error) {
    logger.warn(`Failed to find textbox parent: ${error}`);
    return element;
  }
}

export async function fillContent(page: Page, content: string): Promise<void> {
  let contentElement = await findContentElement(page);

  if (!contentElement) {
    // Try to find a textbox by placeholder
    const placeholderElement = await findTextboxByPlaceholder(page);
    if (placeholderElement) {
      contentElement = await findTextboxParent(page, placeholderElement);
    }
  }

  if (!contentElement) {
    throw new PublishError('Could not find content editor');
  }

  await contentElement.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  // Type content with slight delay
  await contentElement.type(content, { delay: 10 });
}

export async function inputTags(contentElement: Element, tags: string): Promise<void> {
  if (!tags?.trim()) return;

  const tagList = tags
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  for (const tag of tagList) {
    await inputTag(contentElement, tag);
    await sleep(500);
  }
}

export async function inputTag(contentElement: Element, tag: string): Promise<void> {
  try {
    await (contentElement as any).type(`#${tag}`, { delay: 50 });
    await sleep(500);
    await (contentElement as any).page().keyboard.press('Enter');
  } catch (error) {
    logger.warn(`Failed to input tag ${tag}: ${error}`);
  }
}

export async function addTags(page: Page, tags: string): Promise<void> {
  const contentElement = await findContentElement(page);
  if (!contentElement) return;
  await inputTags(contentElement, tags);
}

export async function submitPost(page: Page): Promise<void> {
  const submitSelectors = [
    'button.submit',
    'button[type="submit"]',
    '.publish-btn',
    '.submit-btn',
    'div.submit button',
    'button:contains("发布")',
  ];

  let submitButton = await findElementBySelectors(page, submitSelectors);

  if (!submitButton) {
    // Try to find any button with text '发布'
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const text = await page.evaluate((el) => el.textContent, button);
      if (text && text.includes('发布')) {
        submitButton = button;
        break;
      }
    }
  }

  if (!submitButton) {
    throw new PublishError('Could not find submit button');
  }

  // Scroll to submit button and click
  const clicked = await page.evaluate((element: Element) => {
    const publish = element as HTMLElement;
    if (!publish) return false;

    publish.scrollIntoView({ block: 'center', inline: 'center' });
    publish.click();
    return true;
  }, submitButton);

  if (!clicked) {
    throw new PublishError('Could not find submit button');
  }

  await sleep(2000);
}

export async function isElementVisible(element: Element): Promise<boolean> {
  try {
    return await (element as any).isIntersectingViewport();
  } catch (error) {
    return false;
  }
}

export async function waitForPublishCompletion(page: Page): Promise<string | null> {
  const maxWaitTime = 60000; // 60 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    // Check for success indicators
    const successIndicators = [
      '.success-message',
      '.publish-success',
      '[data-testid="publish-success"]',
      '.toast-success',
    ];

    for (const selector of successIndicators) {
      const element = await page.$(selector);
      if (element) {
        await sleep(2000); // Wait a bit more for any final processing
        return await extractNoteIdFromPage(page);
      }
    }

    // Check for error indicators
    const errorIndicators = [
      '.error-message',
      '.publish-error',
      '[data-testid="publish-error"]',
      '.toast-error',
      '.error-toast',
    ];

    for (const selector of errorIndicators) {
      const element = await page.$(selector);
      if (element) {
        const errorText = await page.evaluate((el) => el.textContent, element);
        throw new PublishError(`Publish failed with error: ${errorText}`);
      }
    }

    // Check if we're still on the publish page
    const publishPageIndicators = ['div.upload-content', 'div.submit', '.creator-editor'];

    let stillOnPublishPage = false;
    for (const selector of publishPageIndicators) {
      const element = await page.$(selector);
      if (element) {
        stillOnPublishPage = true;
        break;
      }
    }

    if (!stillOnPublishPage) {
      // We've left the publish page, likely successful
      logger.debug('Left publish page, assuming success');
      return await extractNoteIdFromPage(page);
    }

    // Check for toast messages
    const toastSelectors = ['.toast', '.message', '.notification', '[role="alert"]'];

    for (const selector of toastSelectors) {
      const element = await page.$(selector);
      if (element) {
        const toastText = await page.evaluate((el) => el.textContent, element);
        if (toastText) {
          if (toastText.includes('成功') || toastText.includes('success')) {
            logger.debug(`Found success toast: ${toastText}`);
            return await extractNoteIdFromPage(page);
          } else if (
            toastText.includes('失败') ||
            toastText.includes('error') ||
            toastText.includes('错误')
          ) {
            throw new PublishError(`Publish failed: ${toastText}`);
          }
        }
      }
    }

    await sleep(1000); // Wait before next check
  }

  throw new PublishError('Publish completion timeout - could not determine result');
}

export async function extractNoteIdFromPage(page: Page): Promise<string | null> {
  try {
    // Method 1: Try to extract from URL if redirected to note page
    const currentUrl = page.url();
    logger.debug(`Current URL after publish: ${currentUrl}`);

    // Check if we're on a note page (URL contains /explore/ or /discovery/)
    const noteIdMatch = currentUrl.match(/\/explore\/([a-f0-9]+)/i) ||
                       currentUrl.match(/\/discovery\/([a-f0-9]+)/i);

    if (noteIdMatch && noteIdMatch[1]) {
      const noteId = noteIdMatch[1];
      logger.debug(`Extracted note ID from URL: ${noteId}`);
      return noteId;
    }

    // Method 2: Try to find note ID in page content or data attributes
    const noteIdFromPage = await page.evaluate(() => {
      // Look for data attributes that might contain note ID
      const elementsWithData = document.querySelectorAll('[data-note-id], [data-id], [data-impression]');
      for (let i = 0; i < elementsWithData.length; i++) {
        const element = elementsWithData[i];
        const noteId = element.getAttribute('data-note-id') ||
                      element.getAttribute('data-id') ||
                      element.getAttribute('data-impression');
        if (noteId && noteId.length > 10) { // Note IDs are typically long
          return noteId;
        }
      }

      // Look for links to note pages
      const noteLinks = document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/"]');
      for (let i = 0; i < noteLinks.length; i++) {
        const link = noteLinks[i];
        const href = link.getAttribute('href');
        if (href) {
          const match = href.match(/\/explore\/([a-f0-9]+)/i) ||
                       href.match(/\/discovery\/([a-f0-9]+)/i);
          if (match && match[1]) {
            return match[1];
          }
        }
      }

      return null;
    });

    if (noteIdFromPage) {
      logger.debug(`Extracted note ID from page content: ${noteIdFromPage}`);
      return noteIdFromPage;
    }

    return null;
  } catch (error) {
    logger.warn(`Failed to extract note ID: ${error}`);
    return null;
  }
}

export async function waitForVideoPublishCompletion(page: Page): Promise<string | null> {
  const done = await waitForCondition(
    async () => {
      const success = await checkPageForPatterns(
        page,
        SELECTORS.SUCCESS_INDICATORS,
        TEXT_PATTERNS.SUCCESS
      );
      if (success) return true;

      await sleep(VIDEO_TIMEOUTS.COMPLETION_CHECK);

      const failed = await checkPageForPatterns(
        page,
        SELECTORS.ERROR_INDICATORS,
        TEXT_PATTERNS.ERROR
      );
      if (failed) {
        throw new PublishError('Video publish failed.');
      }

      // if page navigated away from publish area, likely success
      const stillOnPublish = await checkPageForPatterns(
        page,
        SELECTORS.PUBLISH_PAGE_INDICATORS
      );
      if (!stillOnPublish) return true;

      const isProcessing = await checkPageForPatterns(
        page,
        SELECTORS.PROCESSING_INDICATORS,
        TEXT_PATTERNS.PROCESSING
      );
      if (isProcessing) return false;

      const toastSuccess = await checkPageForPatterns(
        page,
        SELECTORS.TOAST_SELECTORS,
        TEXT_PATTERNS.SUCCESS
      );
      if (toastSuccess) return true;

      const toastError = await checkPageForPatterns(
        page,
        SELECTORS.TOAST_SELECTORS,
        TEXT_PATTERNS.ERROR
      );
      if (toastError) {
        throw new PublishError('Video publish failed with error toast.');
      }

      return false;
    },
    VIDEO_TIMEOUTS.COMPLETION_TIMEOUT,
    VIDEO_TIMEOUTS.COMPLETION_CHECK,
    'Video publish completion timeout'
  );

  return done ? await extractNoteIdFromPage(page) : null;
}

export async function clickVideoUploadTab(page: Page): Promise<void> {
  const tab = await findElementBySelectors(page, ['.video-tab', '.upload-video', 'button:has-text("视频")']);
  if (tab) {
    await (tab as any).click();
  }
}

export async function uploadVideo(page: Page, videoPath: string): Promise<void> {
  const fileInput = await findElementBySelectors(page, SELECTORS.FILE_INPUT);
  if (!fileInput) {
    throw new PublishError('Could not find video upload input');
  }

  await (fileInput as any).uploadFile(videoPath);
  await sleep(VIDEO_TIMEOUTS.UPLOAD_READY);

  // wait for upload to start
  await waitForCondition(
    async () => {
      const started = await checkPageForPatterns(
        page,
        SELECTORS.PROCESSING_INDICATORS,
        TEXT_PATTERNS.PROCESSING
      );
      if (!started) {
        await sleep(VIDEO_TIMEOUTS.UPLOAD_START);
      }
      return started;
    },
    VIDEO_TIMEOUTS.PROCESSING_TIMEOUT,
    VIDEO_TIMEOUTS.PROCESSING_CHECK,
    'Video upload did not start in time'
  );
}

export async function waitForVideoProcessing(page: Page): Promise<void> {
  await waitForCondition(
    async () => {
      const success = await checkPageForPatterns(
        page,
        SELECTORS.COMPLETION_INDICATORS,
        TEXT_PATTERNS.SUCCESS
      );
      if (success) return true;

      const processing = await checkPageForPatterns(
        page,
        SELECTORS.PROCESSING_INDICATORS,
        TEXT_PATTERNS.PROCESSING
      );
      return !processing;
    },
    VIDEO_TIMEOUTS.PROCESSING_TIMEOUT,
    VIDEO_TIMEOUTS.PROCESSING_CHECK,
    'Video processing timeout'
  );
}

export async function checkPageForPatterns(
  page: Page,
  selectors: readonly string[],
  patterns?: readonly string[]
): Promise<boolean> {
  const element = await findElementBySelectors(page, selectors);
  if (!element) return false;
  if (!patterns || patterns.length === 0) return true;
  return checkElementForPatterns(element as any, patterns);
}

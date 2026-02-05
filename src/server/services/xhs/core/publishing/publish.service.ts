/**
 * Publishing service for XHS MCP Server
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { Page } from 'puppeteer';
import { Config, PublishResult } from '../../shared/types';
import { PublishError } from '../../shared/errors';
import { BaseService } from '../../shared/base.service';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';
import { ImageDownloader } from '../../shared/image-downloader';
import { assertTitleWidthValid, getTitleWidth } from '../../shared/title-validator';
import {
  addTags,
  clickUploadTab,
  clickVideoUploadTab,
  dumpDebug,
  fillContent,
  fillTitle,
  submitPost,
  uploadImages,
  uploadVideo,
  validateAndResolveImagePaths,
  waitForPublishCompletion,
  waitForVideoProcessing,
  waitForVideoPublishCompletion,
  VIDEO_TIMEOUTS,
} from './publishHelpers';


export class PublishService extends BaseService {
  private imageDownloader: ImageDownloader;

  constructor(config: Config) {
    super(config);
    this.imageDownloader = new ImageDownloader('./temp_images');
  }

  async publishNote(
    title: string,
    content: string,
    imagePaths: string[],
    tags: string = '',
    browserPath?: string
  ): Promise<PublishResult> {
    // Validate inputs
    if (!title?.trim()) {
      throw new PublishError('Note title cannot be empty');
    }

    // Validate title width (CJK characters count as 2 units, ASCII as 1)
    assertTitleWidthValid(title);
    logger.debug(`Title width validation passed: "${title}" (${getTitleWidth(title)} units)`);

    if (!content?.trim()) {
      throw new PublishError('Note content cannot be empty');
    }

    if (!imagePaths || imagePaths.length === 0) {
      throw new PublishError('At least one image is required');
    }

    // Process image paths - download URLs and validate local paths
    const resolvedPaths = await validateAndResolveImagePaths(this.imageDownloader, imagePaths);

    // Wait for upload container selector
    const uploadSelector = 'div.upload-content';

    try {
      const page = await this.getBrowserManager().createPage(false, browserPath, true);
      await page.bringToFront();

      try {
        await this.getBrowserManager().navigateWithRetry(
          page,
          this.getConfig().xhs.creatorPublishUrl
        );

        // Wait for page to load
        await sleep(3000);

        // First, try to switch to the image/text upload tab
        await clickUploadTab(page);

        // Wait for tab switch to complete
        await sleep(3000);

        // Check if tab switch was successful and retry if needed
        const pageState = await page.evaluate(() => {
          return {
            buttonTexts: Array.from(document.querySelectorAll('button, div[role="button"]'))
              .map((el: Element) => el.textContent?.trim())
              .filter((t: string | undefined) => t),
          };
        });

        // If still showing video upload, try clicking the tab again
        if (
          pageState.buttonTexts.includes('上传视频') &&
          !pageState.buttonTexts.includes('上传图文')
        ) {
          await clickUploadTab(page);
          await sleep(3000);
        }

        let hasUploadContainer = await this.getBrowserManager().tryWaitForSelector(
          page,
          uploadSelector,
          30000
        );

        if (!hasUploadContainer) {
          // Try alternative selectors for upload container
          const alternativeSelectors = [
            'div.upload-content',
            '.upload-content',
            'div[class*="upload"]',
            'div[class*="image"]',
            'input[type="file"]',
          ];

          for (const selector of alternativeSelectors) {
            hasUploadContainer = await this.getBrowserManager().tryWaitForSelector(
              page,
              selector,
              10000
            );
            if (hasUploadContainer) {
              break;
            }
          }
        }

        if (!hasUploadContainer) {
          throw new PublishError('Could not find upload container on publish page');
        }

        // Upload images
        await uploadImages(page, resolvedPaths);

        // Wait for images to be processed
        await sleep(3000);

        // Wait for page to transition to edit mode (check for title or content input)
        try {
          await page.waitForSelector(
            'input[placeholder*="标题"], div[contenteditable="true"], .tiptap.ProseMirror',
            { timeout: 15000 }
          );
        } catch (error) {
          // Continue without waiting
        }

        // Wait a bit for the page to settle after image upload
        await sleep(2000);

        // Fill in title
        await fillTitle(page, title);

        // Wait a bit more for content area to appear
        await sleep(2000);

        // Fill in content
        await fillContent(page, content);

        // Add tags if provided
        if (tags) {
          await addTags(page, tags);
        }

        // Submit the note
        try {
          await submitPost(page);
        } catch (e) {
          await dumpDebug(page, 'submit-failed');
          throw e;
        }

        // Wait for completion and check result
        let noteId: string | null = null;
        try {
          noteId = await waitForPublishCompletion(page);
        } catch (e) {
          await dumpDebug(page, 'wait-completion-failed');
          throw e;
        }

        // Save cookies
        await this.getBrowserManager().saveCookiesFromPage(page);

        return {
          success: true,
          message: 'Note published successfully',
          title,
          content,
          imageCount: resolvedPaths.length,
          tags,
          url: this.getConfig().xhs.creatorPublishUrl,
          noteId: noteId || undefined,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error(`Publish error: ${error}`);
      throw error;
    }
  }

  // Unified publish method for both images and videos
  async publishContent(
    type: 'image' | 'video',
    title: string,
    content: string,
    mediaPaths: string[],
    tags: string = '',
    browserPath?: string
  ): Promise<PublishResult> {
    // Validate inputs
    this.validateContentInputs(type, title, content, mediaPaths);

    if (type === 'image') {
      return await this.publishNote(title, content, mediaPaths, tags, browserPath);
    } else {
      // For videos, only take the first path
      const videoPath = mediaPaths[0];
      return await this.publishVideo(title, content, videoPath, tags, browserPath);
    }
  }

  async publishVideo(
    title: string,
    content: string,
    videoPath: string,
    tags: string = '',
    browserPath?: string
  ): Promise<PublishResult> {
    // Validate inputs
    this.validateVideoInputs(title, content, videoPath);

    // Validate and resolve video path
    const resolvedVideoPath = this.validateAndResolveVideoPath(videoPath);

    try {
      const page = await this.getBrowserManager().createPage(false, browserPath, true);

      try {
        const noteId = await this.executeVideoPublishWorkflow(page, title, content, resolvedVideoPath, tags);

        // Save cookies
        await this.getBrowserManager().saveCookiesFromPage(page);

        return {
          success: true,
          message: 'Video published successfully',
          title,
          content,
          imageCount: 0, // Videos don't have image count
          tags,
          url: this.getConfig().xhs.creatorVideoPublishUrl,
          noteId: noteId || undefined,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error(`Video publish error: ${error}`);
      throw error;
    }
  }

  private validateContentInputs(
    type: 'image' | 'video',
    title: string,
    content: string,
    mediaPaths: string[]
  ): void {
    if (!title?.trim()) {
      throw new PublishError(`${type === 'image' ? 'Image' : 'Video'} title cannot be empty`);
    }

    if (!content?.trim()) {
      throw new PublishError(`${type === 'image' ? 'Image' : 'Video'} content cannot be empty`);
    }

    if (!mediaPaths || mediaPaths.length === 0) {
      throw new PublishError(`${type === 'image' ? 'Image' : 'Video'} paths are required`);
    }

    if (type === 'image' && mediaPaths.length > 18) {
      throw new PublishError('Maximum 18 images allowed for image posts');
    }

    if (type === 'video' && mediaPaths.length !== 1) {
      throw new PublishError('Video publishing requires exactly one video file');
    }
  }

  private validateVideoInputs(title: string, content: string, videoPath: string): void {
    if (!title?.trim()) {
      throw new PublishError('Video title cannot be empty');
    }

    // Validate title width for video posts too
    assertTitleWidthValid(title);
    logger.debug(`Video title width validation passed: "${title}" (${getTitleWidth(title)} units)`);

    if (!content?.trim()) {
      throw new PublishError('Video content cannot be empty');
    }

    if (!videoPath?.trim()) {
      throw new PublishError('Video path is required');
    }
  }

  private async executeVideoPublishWorkflow(
    page: Page,
    title: string,
    content: string,
    videoPath: string,
    tags: string
  ): Promise<string | null> {
    // Navigate to video upload page
    await this.getBrowserManager().navigateWithRetry(
      page,
      this.getConfig().xhs.creatorVideoPublishUrl
    );

    // Wait for page to load
    await sleep(VIDEO_TIMEOUTS.PAGE_LOAD);

    // Switch to video upload tab if needed
    await clickVideoUploadTab(page);

    // Wait for tab switch to complete
    await sleep(VIDEO_TIMEOUTS.TAB_SWITCH);

    // Upload video
    await uploadVideo(page, videoPath);
    await waitForVideoProcessing(page);

    // Wait for video to be processed (videos take longer than images)
    await sleep(VIDEO_TIMEOUTS.VIDEO_PROCESSING);

    // Fill in title
    await fillTitle(page, title);

    // Wait a bit for content area to appear
    await sleep(VIDEO_TIMEOUTS.CONTENT_WAIT);

    // Fill in content
    await fillContent(page, content);

    // Add tags if provided
    if (tags) {
      await addTags(page, tags);
    }

    // Submit the video
    await submitPost(page);

    // Wait for completion and check result (videos need longer timeout)
    return await waitForVideoPublishCompletion(page);
  }

  private validateAndResolveVideoPath(videoPath: string): string {
    const resolvedPath = join(process.cwd(), videoPath);

    if (!existsSync(resolvedPath)) {
      throw new PublishError(`Video file not found: ${videoPath}`);
    }

    const stats = statSync(resolvedPath);
    if (!stats.isFile()) {
      throw new PublishError(`Path is not a file: ${videoPath}`);
    }

    // Check file extension
    const ext = videoPath.toLowerCase().split('.').pop();
    const allowedExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
    if (!ext || !allowedExtensions.includes(ext)) {
      throw new PublishError(
        `Unsupported video format: ${videoPath}. Supported: ${allowedExtensions.join(', ')}`
      );
    }

    // Check file size (XHS typically has limits)
    const maxSizeInMB = 500; // 500MB limit
    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > maxSizeInMB) {
      throw new PublishError(
        `Video file too large: ${fileSizeInMB.toFixed(2)}MB. Maximum allowed: ${maxSizeInMB}MB`
      );
    }

    return resolvedPath;
  }

}

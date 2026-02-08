import { getDatabase } from '../../../db';
import { loadStorageConfig } from '../../storage/config';
import { StorageService } from '../../storage/StorageService';
import { createHash } from 'crypto';
import { BrowserManager } from '../core/browser/browser.manager';

const STORAGE_SUBDIR = 'xhs-capture';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_REFERER = 'https://www.xiaohongshu.com/explore';
const MAX_RETRY = 3;
const BATCH_SIZE = 30;
const BROWSER_IDLE_CLOSE_MS = 2 * 60 * 1000;
let processingPromise: Promise<{ processed: number; success: number; failed: number }> | null = null;
let sharedBrowserManager: BrowserManager | null = null;
let browserIdleTimer: NodeJS.Timeout | null = null;
let drainPromise: Promise<{ processed: number; success: number; failed: number }> | null = null;
const MAX_DRAIN_ROUNDS = 120;
const MAX_DRAIN_MS = 15 * 60 * 1000;
const DRAIN_DELAY_MS = 200;
const DOWNLOAD_CONCURRENCY = Math.max(1, Number(process.env.XHS_IMAGE_DOWNLOAD_CONCURRENCY || 4));

function scheduleBrowserCleanup() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    const manager = sharedBrowserManager;
    sharedBrowserManager = null;
    if (!manager) return;
    void manager.cleanup().catch((error) => {
      console.error('[imageDownload] Failed to cleanup browser:', error);
    });
  }, BROWSER_IDLE_CLOSE_MS);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessExtensionFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('webp')) return 'webp';
  const match = lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:$|[?#])/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  return 'webp';
}

function guessContentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

function buildStorageObject(originalUrl: string): { filename: string; objectPath: string; ext: string } {
  const key = sha256(originalUrl);
  const ext = guessExtensionFromUrl(originalUrl);
  const filename = `${key}.${ext}`;
  return {
    filename,
    objectPath: `${STORAGE_SUBDIR}/${filename}`,
    ext,
  };
}

function buildInternalUrl(objectPath: string): string {
  return `/api/image?path=${encodeURIComponent(objectPath)}`;
}

async function downloadImageWithFetch(url: string, referer: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    // 优先使用 HTTPS
    const fetchUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url;

    const response = await fetch(fetchUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        origin: 'https://www.xiaohongshu.com',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        referer,
      },
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      throw error;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_BYTES) {
      throw new Error(`Image too large: ${buffer.length} bytes`);
    }

    return buffer;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadImageWithBrowser(url: string, referer: string): Promise<Buffer> {
  const browserUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url;
  sharedBrowserManager ??= new BrowserManager();
  const page = await sharedBrowserManager.createPage(true, undefined, true);
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 720 });

    try {
      await page.goto(referer || DEFAULT_REFERER, { waitUntil: 'domcontentloaded', timeout: DOWNLOAD_TIMEOUT_MS });
    } catch {
      // 忽略预热失败
    }

    await page.setExtraHTTPHeaders({
      referer: referer || DEFAULT_REFERER,
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });

    const responsePromise = page.waitForResponse(
      (r) => {
        try {
          const request = r.request();
          const redirectChain = request.redirectChain();
          const firstUrl = redirectChain.length > 0 ? redirectChain[0].url() : request.url();
          const normalizedFirst = firstUrl.startsWith('http://')
            ? firstUrl.replace('http://', 'https://')
            : firstUrl;
          return normalizedFirst === browserUrl;
        } catch {
          return false;
        }
      },
      { timeout: DOWNLOAD_TIMEOUT_MS }
    );

    await page.evaluate((imageUrl) => {
      const img = document.createElement('img');
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = imageUrl;
      img.style.position = 'fixed';
      img.style.left = '-99999px';
      img.style.top = '-99999px';
      document.body.appendChild(img);
    }, browserUrl);

    const response = await responsePromise;
    if (!response) {
      throw new Error('No response from browser');
    }
    const status = response.status();
    if (status >= 400) {
      const error = new Error(`Browser upstream error: ${status}`);
      (error as any).status = status;
      throw error;
    }
    const headers = response.headers() || {};
    const contentType = String(headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`);
    }

    const buffer = await response.buffer();
    if (buffer.length > MAX_BYTES) {
      throw new Error(`Image too large: ${buffer.length} bytes`);
    }

    return buffer;
  } finally {
    try {
      await page.close();
    } catch {
      // ignore
    }
    scheduleBrowserCleanup();
  }
}

async function downloadImage(url: string, referer: string): Promise<Buffer> {
  try {
    return await downloadImageWithFetch(url, referer);
  } catch (error: any) {
    const status = error?.status;
    if (status !== 403) throw error;
    return await downloadImageWithBrowser(url, referer);
  }
}

function buildRefererFromTopic(topic: {
  url?: string | null;
  note_id?: string | null;
  xsec_token?: string | null;
  source_id?: string | null;
}): string | null {
  if (topic.url) return topic.url;
  const noteId = topic.note_id || topic.source_id;
  if (!noteId) return null;
  if (topic.xsec_token) {
    return `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(
      topic.xsec_token
    )}&xsec_source=pc_feed`;
  }
  return `https://www.xiaohongshu.com/explore/${noteId}`;
}

async function loadRefererMap(topicIds: number[]): Promise<Map<number, string>> {
  const refererMap = new Map<number, string>();
  if (!topicIds.length) return refererMap;

  const db = getDatabase();
  const { data, error } = await db
    .from('topics')
    .select('id, url, note_id, xsec_token, source_id')
    .in('id', topicIds);

  if (error) {
    console.warn('[imageDownload] Failed to load topic referers:', error);
    return refererMap;
  }

  for (const topic of data || []) {
    const referer = buildRefererFromTopic(topic) || DEFAULT_REFERER;
    refererMap.set(topic.id as number, referer);
  }

  return refererMap;
}

// 将图片 URL 加入下载队列
export async function enqueueImageDownload(
  topicId: number,
  coverUrl: string | null,
  mediaUrls: string[] | null
): Promise<number> {
  const db = getDatabase();
  const tasks: Array<{ topic_id: number; image_type: string; image_index: number; original_url: string }> = [];

  if (coverUrl) {
    tasks.push({
      topic_id: topicId,
      image_type: 'cover',
      image_index: 0,
      original_url: coverUrl,
    });
  }

  if (mediaUrls && Array.isArray(mediaUrls)) {
    mediaUrls.forEach((url, index) => {
      if (url) {
        tasks.push({
          topic_id: topicId,
          image_type: 'media',
          image_index: index,
          original_url: url,
        });
      }
    });
  }

  if (tasks.length === 0) return 0;

  // 使用 upsert 避免重复
  const { error } = await db
    .from('image_download_queue')
    .upsert(tasks, {
      onConflict: 'topic_id,image_type,image_index',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error('[imageDownload] Failed to enqueue:', error);
    throw error;
  }

  console.log(`[imageDownload] Enqueued ${tasks.length} images for topic ${topicId}`);
  return tasks.length;
}

// 处理下载队列中的任务
export async function processImageDownloadQueue(batchSize = BATCH_SIZE): Promise<{
  processed: number;
  success: number;
  failed: number;
}> {
  if (processingPromise) {
    return processingPromise;
  }

  processingPromise = (async () => {
    const db = getDatabase();

    // 加载并验证 MinIO 配置
    let storageService: StorageService;
    try {
      const storageConfig = await loadStorageConfig();
      if (storageConfig.type !== 'minio' || !storageConfig.minio) {
        throw new Error(
          'MinIO storage is not configured. Please set STORAGE_TYPE=minio and configure MinIO credentials in environment variables or database settings.'
        );
      }
      storageService = StorageService.reinitialize(storageConfig);
      console.log('[imageDownload] MinIO storage initialized successfully');
    } catch (error: any) {
      console.error('[imageDownload] MinIO configuration error:', error.message);
      throw new Error(`MinIO storage is required but not configured: ${error.message}`);
    }

    // 获取待处理的任务
    const { data: tasks, error: fetchError } = await db
      .from('image_download_queue')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lt('retry_count', MAX_RETRY)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      console.error('[imageDownload] Failed to fetch queue:', fetchError);
      throw fetchError;
    }

    if (!tasks || tasks.length === 0) {
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`[imageDownload] Processing ${tasks.length} tasks...`);

    let success = 0;
    let failed = 0;

    const refererMap = await loadRefererMap(
      Array.from(new Set(tasks.map((task) => task.topic_id as number)))
    );

    const tasksByTopic = new Map<number, typeof tasks>();
    for (const task of tasks) {
      const key = Number(task.topic_id);
      if (!tasksByTopic.has(key)) tasksByTopic.set(key, []);
      tasksByTopic.get(key)!.push(task);
    }

    const groups = Array.from(tasksByTopic.values());
    let groupIndex = 0;

    const runGroup = async () => {
      while (true) {
        const current = groups[groupIndex];
        if (!current) break;
        groupIndex += 1;

        for (const task of current) {
          // 标记为处理中
          await db
            .from('image_download_queue')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', task.id);

          let didDownload = false;

          try {
            let storedPath: string;
            let storedUrl: string;
            const { objectPath } = buildStorageObject(task.original_url);

            const referer = refererMap.get(task.topic_id as number) || DEFAULT_REFERER;

            // 检查 MinIO 中是否已存在
            let exists = false;
            try {
              exists = await storageService.exists(objectPath);
            } catch (error: any) {
              throw new Error(`MinIO operation failed: ${error.message}`);
            }

            if (exists) {
              try {
                storedPath = objectPath;
                storedUrl = buildInternalUrl(objectPath);
                console.log(`[imageDownload] Image already exists in MinIO: ${objectPath}`);
              } catch (error: any) {
                throw new Error(`MinIO operation failed: ${error.message}`);
              }
            } else {
              // 下载图片到内存（必要时用浏览器绕过防盗链）
              let buffer: Buffer;
              try {
                buffer = await downloadImage(task.original_url, referer);
                didDownload = true;
              } catch (error: any) {
                throw new Error(`Download failed: ${error.message}`);
              }

              try {
                const { filename, ext } = buildStorageObject(task.original_url);
                await storageService.store(buffer, filename, {
                  subdir: STORAGE_SUBDIR,
                  contentType: guessContentTypeFromExt(ext),
                  metadata: {
                    'xhs-origin-url': task.original_url,
                    'xhs-topic-id': String(task.topic_id),
                  },
                });

                storedPath = objectPath;
                storedUrl = buildInternalUrl(objectPath);
                console.log(`[imageDownload] Uploaded to MinIO: ${objectPath}`);
              } catch (error: any) {
                throw new Error(`MinIO operation failed: ${error.message}`);
              }
            }

            // 更新队列状态
            await db
              .from('image_download_queue')
              .update({
                status: 'completed',
                stored_path: storedPath,
                stored_url: storedUrl,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            // 更新 topics 表中的 URL
            await updateTopicImageUrl(task.topic_id, task.image_type, task.image_index, storedUrl);

            console.log(`[imageDownload] Completed: ${task.original_url.slice(0, 50)}...`);
            success++;
          } catch (error: any) {
            console.error(`[imageDownload] Failed to process task ${task.id}:`, error.message);

            const message = String(error?.message || '');
            const nonRetryable = message.includes(' 403') || message.includes('403:') || message.includes('Browser upstream error: 403');

            await db
              .from('image_download_queue')
              .update({
                status: 'failed',
                retry_count: nonRetryable ? MAX_RETRY : (task.retry_count || 0) + 1,
                error_message: error.message,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            failed++;
          }

          if (didDownload) {
            await sleep(200);
          }
        }
      }
    };

    const workerCount = Math.min(DOWNLOAD_CONCURRENCY, groups.length || 1);
    await Promise.all(Array.from({ length: workerCount }, runGroup));

    return { processed: tasks.length, success, failed };
  })();

  try {
    return await processingPromise;
  } finally {
    processingPromise = null;
  }
}

export function triggerImageDownloadProcessing(batchSize = BATCH_SIZE) {
  void drainImageDownloadQueue(batchSize).catch((error: any) => {
    console.error('[imageDownload] Background processing failed:', error?.message || error);
  });
}

export async function drainImageDownloadQueue(batchSize = BATCH_SIZE): Promise<{
  processed: number;
  success: number;
  failed: number;
}> {
  if (drainPromise) {
    return drainPromise;
  }

  drainPromise = (async () => {
    let processed = 0;
    let success = 0;
    let failed = 0;
    const startedAt = Date.now();

    for (let round = 0; round < MAX_DRAIN_ROUNDS; round += 1) {
      const result = await processImageDownloadQueue(batchSize);
      if (result.processed === 0) break;
      processed += result.processed;
      success += result.success;
      failed += result.failed;

      if (Date.now() - startedAt > MAX_DRAIN_MS) {
        console.warn('[imageDownload] Drain stopped due to max runtime limit');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS));
    }

    return { processed, success, failed };
  })();

  try {
    return await drainPromise;
  } finally {
    drainPromise = null;
  }
}

// 更新 topics 表中的图片 URL 为 MinIO URL
async function updateTopicImageUrl(
  topicId: number,
  imageType: string,
  imageIndex: number,
  storedUrl: string
): Promise<void> {
  const db = getDatabase();

  if (imageType === 'cover') {
    await db
      .from('topics')
      .update({ cover_url: storedUrl })
      .eq('id', topicId);
  } else if (imageType === 'media') {
    // 获取当前的 media_urls
    const { data: topic } = await db
      .from('topics')
      .select('media_urls')
      .eq('id', topicId)
      .single();

    if (topic?.media_urls) {
      let mediaUrls: string[];
      try {
        mediaUrls = typeof topic.media_urls === 'string'
          ? JSON.parse(topic.media_urls)
          : topic.media_urls;
      } catch {
        mediaUrls = [];
      }

      if (Array.isArray(mediaUrls) && imageIndex < mediaUrls.length) {
        mediaUrls[imageIndex] = storedUrl;
        await db
          .from('topics')
          .update({ media_urls: JSON.stringify(mediaUrls) })
          .eq('id', topicId);
      }
    }
  }
}

// 获取队列状态统计
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const db = getDatabase();

  const { data, error } = await db
    .from('image_download_queue')
    .select('status');

  if (error) throw error;

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of data || []) {
    const status = row.status as keyof typeof counts;
    if (status in counts) counts[status]++;
  }
  return counts;
}

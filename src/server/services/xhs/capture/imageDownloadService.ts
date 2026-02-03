import { getDatabase } from '../../../db';
import { loadStorageConfig } from '../../storage/config';
import { StorageService } from '../../storage/StorageService';
import { createHash } from 'crypto';

const STORAGE_SUBDIR = 'xhs-capture';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_REFERER = 'https://www.xiaohongshu.com/explore';
const MAX_RETRY = 3;
const BATCH_SIZE = 10;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
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

async function downloadImage(url: string, referer: string): Promise<Buffer> {
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  for (const task of tasks) {
    // 标记为处理中
    await db
      .from('image_download_queue')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', task.id);

    try {
      let storedPath: string;
      let storedUrl: string;

      const { objectPath } = buildStorageObject(task.original_url);

      // 检查 MinIO 中是否已存在
      try {
        const exists = await storageService.exists(objectPath);
        if (exists) {
          storedPath = objectPath;
          storedUrl = await storageService.getUrl(objectPath);
          console.log(`[imageDownload] Image already exists in MinIO: ${objectPath}`);
        } else {
          // 下载图片到内存
          const buffer = await downloadImage(task.original_url, DEFAULT_REFERER);

          // 上传到 MinIO
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
          storedUrl = await storageService.getUrl(objectPath);
          console.log(`[imageDownload] Uploaded to MinIO: ${objectPath}`);
        }
      } catch (error: any) {
        throw new Error(`MinIO operation failed: ${error.message}`);
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

      await db
        .from('image_download_queue')
        .update({
          status: 'failed',
          retry_count: (task.retry_count || 0) + 1,
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      failed++;
    }

    // 添加延迟避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { processed: tasks.length, success, failed };
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

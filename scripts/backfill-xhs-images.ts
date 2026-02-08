import dotenv from 'dotenv';
import { db, schema } from '../src/server/db';
import { and, eq, gt, ilike, or } from 'drizzle-orm';
import { enqueueImageDownload, processImageDownloadQueue } from '../src/server/services/xhs/capture/imageDownloadService';
import { loadStorageConfig } from '../src/server/services/storage/config';

type Options = {
  themeId?: number;
  pageSize: number;
  limit?: number;
  processBatch: number;
  enqueueOnly: boolean;
  dryRun: boolean;
  resetFailed: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    pageSize: 200,
    processBatch: 20,
    enqueueOnly: false,
    dryRun: false,
    resetFailed: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    const [key, value] = arg.split('=');
    switch (key) {
      case '--theme-id':
        options.themeId = Number(value ?? argv[i + 1]);
        if (!value) i += 1;
        break;
      case '--page-size':
        options.pageSize = Number(value ?? argv[i + 1]);
        if (!value) i += 1;
        break;
      case '--limit':
        options.limit = Number(value ?? argv[i + 1]);
        if (!value) i += 1;
        break;
      case '--process-batch':
        options.processBatch = Number(value ?? argv[i + 1]);
        if (!value) i += 1;
        break;
      case '--enqueue-only':
        options.enqueueOnly = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--reset-failed':
        options.resetFailed = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: npx tsx scripts/backfill-xhs-images.ts [options]

Options:
  --theme-id <id>        只处理指定主题的 topics
  --page-size <n>        每页扫描数量（默认 200）
  --limit <n>            最多处理多少条 topics
  --process-batch <n>    每批处理队列任务数量（默认 20）
  --enqueue-only         只入队，不处理下载
  --dry-run              只打印，不入队/不处理
  --reset-failed         重置失败队列状态（重试用）
  -h, --help             显示帮助
`);
}

function isRemoteXhsUrl(raw?: string | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return host === 'xhscdn.com'
      || host.endsWith('.xhscdn.com')
      || host === 'xiaohongshu.com'
      || host.endsWith('.xiaohongshu.com');
  } catch {
    return false;
  }
}

function parseMediaUrls(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string') as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string') as string[];
      }
    } catch {
      return [];
    }
  }
  return [];
}

async function drainQueue(batchSize: number): Promise<{ processed: number; success: number; failed: number }> {
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  while (true) {
    const result = await processImageDownloadQueue(batchSize);
    if (result.processed === 0) break;
    totalProcessed += result.processed;
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  return { processed: totalProcessed, success: totalSuccess, failed: totalFailed };
}

async function main() {
  process.env.DOTENV_CONFIG_QUIET = 'true';
  dotenv.config({ path: ['.env.local', '.env'] });

  const options = parseArgs(process.argv.slice(2));

  if (options.resetFailed && !options.dryRun) {
    const now = new Date();
    await db
      .update(schema.imageDownloadQueue)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(schema.imageDownloadQueue.status, 'failed'));
    console.log('[backfill] reset failed queue');
  }

  if (!options.enqueueOnly) {
    const storageConfig = await loadStorageConfig();
    if (storageConfig.type !== 'minio' || !storageConfig.minio) {
      console.error('[backfill] MinIO 未配置，无法处理队列。请先设置 STORAGE_TYPE=minio。');
      process.exit(1);
    }
  }

  const topics = schema.topics;
  let lastId = 0;
  let scanned = 0;
  let enqueued = 0;

  console.log('[backfill] start', options);

  while (true) {
    const conditions = [
      gt(topics.id, lastId),
      or(
        ilike(topics.coverUrl, '%xhscdn%'),
        ilike(topics.coverUrl, '%xiaohongshu%'),
        ilike(topics.mediaUrls, '%xhscdn%'),
        ilike(topics.mediaUrls, '%xiaohongshu%')
      ),
    ];

    if (options.themeId) {
      conditions.push(eq(topics.themeId, options.themeId));
    }

    const rows = await db
      .select({
        id: topics.id,
        coverUrl: topics.coverUrl,
        mediaUrls: topics.mediaUrls,
      })
      .from(topics)
      .where(and(...conditions))
      .orderBy(topics.id)
      .limit(options.pageSize);

    if (!rows.length) break;

    for (const row of rows) {
      lastId = row.id;
      scanned += 1;
      if (options.limit && scanned > options.limit) break;

      const coverUrl = typeof row.coverUrl === 'string' ? row.coverUrl : null;
      const mediaUrls = parseMediaUrls(row.mediaUrls as any);

      const coverNeeds = isRemoteXhsUrl(coverUrl);
      const mediaUrlsForEnqueue = mediaUrls.map((url) => (isRemoteXhsUrl(url) ? url : ''));
      const hasMediaNeeds = mediaUrlsForEnqueue.some((url) => Boolean(url));

      if (!coverNeeds && !hasMediaNeeds) continue;

      if (options.dryRun) {
        console.log(`[backfill][dry-run] topic ${row.id} enqueue cover=${coverNeeds} media=${hasMediaNeeds}`);
        continue;
      }

      const added = await enqueueImageDownload(
        row.id,
        coverNeeds ? coverUrl : null,
        hasMediaNeeds ? mediaUrlsForEnqueue : null
      );
      enqueued += added;
    }

    if (options.limit && scanned >= options.limit) break;

    console.log(`[backfill] scanned=${scanned} enqueued=${enqueued} lastId=${lastId}`);

    if (!options.enqueueOnly && !options.dryRun) {
      const result = await drainQueue(options.processBatch);
      if (result.processed > 0) {
        console.log(`[backfill] processed=${result.processed} success=${result.success} failed=${result.failed}`);
      }
    }
  }

  if (!options.enqueueOnly && !options.dryRun) {
    const result = await drainQueue(options.processBatch);
    if (result.processed > 0) {
      console.log(`[backfill] processed=${result.processed} success=${result.success} failed=${result.failed}`);
    }
  }

  console.log(`[backfill] done scanned=${scanned} enqueued=${enqueued}`);
}

main().catch((error) => {
  console.error('[backfill] failed:', error);
  process.exit(1);
});

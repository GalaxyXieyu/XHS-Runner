import dotenv from 'dotenv';
import { and, eq, gt, ilike, or } from 'drizzle-orm';
import { db, schema } from '../src/server/db';

const PAGE_SIZE = 200;
const STORAGE_PREFIX = '/api/storage/';
const INTERNAL_PREFIX = '/api/image?path=';

function parseMediaUrls(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string') as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string') as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function buildInternalUrl(objectPath: string): string {
  return `${INTERNAL_PREFIX}${encodeURIComponent(objectPath)}`;
}

function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith(INTERNAL_PREFIX)) return raw;
  if (raw.startsWith('/api/assets/')) return raw;
  if (raw.startsWith('data:image/')) return raw;

  if (raw.startsWith(STORAGE_PREFIX)) {
    const objectPath = raw.slice(STORAGE_PREFIX.length);
    return buildInternalUrl(objectPath);
  }

  const index = raw.indexOf('xhs-capture/');
  if (index >= 0) {
    const tail = raw.slice(index);
    const objectPath = tail.split('?')[0];
    return buildInternalUrl(objectPath);
  }

  return raw;
}

async function main() {
  process.env.DOTENV_CONFIG_QUIET = 'true';
  dotenv.config({ path: ['.env.local', '.env'] });

  const topics = schema.topics;
  let lastId = 0;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const rows = await db
      .select({ id: topics.id, coverUrl: topics.coverUrl, mediaUrls: topics.mediaUrls })
      .from(topics)
      .where(
        and(
          gt(topics.id, lastId),
          or(
            ilike(topics.coverUrl, '%xhs-capture%'),
            ilike(topics.coverUrl, '%/api/storage/%'),
            ilike(topics.coverUrl, '%xhs-assets%'),
            ilike(topics.mediaUrls, '%xhs-capture%'),
            ilike(topics.mediaUrls, '%/api/storage/%'),
            ilike(topics.mediaUrls, '%xhs-assets%')
          )
        )
      )
      .orderBy(topics.id)
      .limit(PAGE_SIZE);

    if (!rows.length) break;

    for (const row of rows) {
      lastId = row.id;
      scanned += 1;

      const normalizedCover = normalizeUrl(row.coverUrl);
      const mediaUrls = parseMediaUrls(row.mediaUrls as any);
      const normalizedMedia = mediaUrls.map((url) => normalizeUrl(url) || url);

      const coverChanged = normalizedCover && normalizedCover !== row.coverUrl;
      const mediaChanged = JSON.stringify(mediaUrls) !== JSON.stringify(normalizedMedia);

      if (!coverChanged && !mediaChanged) continue;

      const payload: Record<string, any> = {};
      if (coverChanged) payload.coverUrl = normalizedCover;
      if (mediaChanged) payload.mediaUrls = JSON.stringify(normalizedMedia);

      await db
        .update(topics)
        .set(payload)
        .where(eq(topics.id, row.id));
      updated += 1;
    }
  }

  console.log(`[normalize] scanned=${scanned} updated=${updated}`);
}

main().catch((error) => {
  console.error('[normalize] failed:', error);
  process.exit(1);
});

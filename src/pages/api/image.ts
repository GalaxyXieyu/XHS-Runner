import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveUserDataPath } from '@/server/runtime/userDataPath';
import { BrowserManager } from '@/server/services/xhs/core/browser/browser.manager';

export const config = {
  api: {
    responseLimit: false,
  },
};

const ALLOWED_IMAGE_HOSTS = ['xhscdn.com', 'xiaohongshu.com'];
const CACHE_SUBDIR = ['assets', 'images'];
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const DEFAULT_REFERER = 'https://www.xiaohongshu.com/explore';
const BROWSER_CONCURRENCY = 2;
const BROWSER_IDLE_CLOSE_MS = 2 * 60 * 1000;

class Semaphore {
  private available: number;
  private waiters: Array<(release: () => void) => void> = [];

  constructor(max: number) {
    this.available = Math.max(1, max);
  }

  acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve(() => this.release());
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release() {
    const next = this.waiters.shift();
    if (next) {
      next(() => this.release());
      return;
    }
    this.available += 1;
  }
}

function isAllowedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

function normalizeReferer(raw: unknown): string | null {
  if (!raw || Array.isArray(raw)) return null;
  try {
    const url = new URL(String(raw));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // Upgrade to HTTPS to avoid mixed-content and keep validation simple.
    if (url.protocol === 'http:') url.protocol = 'https:';
    const host = url.hostname.toLowerCase();
    if (host === 'www.xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function isDisallowedLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true;
  if (normalized === '127.0.0.1' || normalized === '0.0.0.0') return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  if (normalized.startsWith('172.')) {
    const parts = normalized.split('.');
    const second = Number(parts[1] || 0);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function getCacheDir(): string {
  return resolveUserDataPath(...CACHE_SUBDIR);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function guessExtensionFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('webp')) return 'webp';
  const match = lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:$|[?#])/);
  if (match) return match[1] === 'jpeg' ? 'jpg' : match[1];
  return 'img';
}

function guessContentTypeFromExt(ext: string): string {
  switch (ext) {
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

function buildCachePaths(originalUrl: string): { dataPath: string; metaPath: string } {
  const key = sha256(originalUrl);
  const ext = guessExtensionFromUrl(originalUrl);
  const dir = getCacheDir();
  return {
    dataPath: path.join(dir, `${key}.${ext}`),
    metaPath: path.join(dir, `${key}.json`),
  };
}

function readMeta(metaPath: string): { contentType?: string } | null {
  try {
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeMeta(metaPath: string, meta: { contentType: string; originalUrl: string }): void {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function serveFile(res: NextApiResponse, filePath: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[image] Failed to read cached file:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'failed to read cache' });
      return;
    }
    try {
      res.end();
    } catch {
      // ignore
    }
  });
  stream.pipe(res);
}

const inflight = new Map<string, Promise<{ dataPath: string; contentType: string }>>();
let sharedBrowserManager: BrowserManager | null = null;
const browserSemaphore = new Semaphore(BROWSER_CONCURRENCY);
let browserIdleTimer: NodeJS.Timeout | null = null;

async function cleanupSharedBrowser() {
  const manager = sharedBrowserManager;
  sharedBrowserManager = null;
  if (!manager) return;
  try {
    await manager.cleanup();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[image] Failed to cleanup browser:', err);
  }
}

function scheduleBrowserCleanup() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    void cleanupSharedBrowser();
  }, BROWSER_IDLE_CLOSE_MS);
}

async function downloadWithFetch(url: string, referer: string): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        origin: 'https://www.xiaohongshu.com',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        referer,
      },
    });

    if (!upstream.ok) {
      const err = new Error(`Upstream error: ${upstream.status}`);
      (err as any).status = upstream.status;
      throw err;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      throw new Error(`Image too large: ${contentLength} bytes`);
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_BYTES) {
      throw new Error(`Image too large: ${buffer.length} bytes`);
    }

    return { buffer, contentType };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadWithBrowser(url: string, referer: string): Promise<{ buffer: Buffer; contentType: string }> {
  const release = await browserSemaphore.acquire();
  sharedBrowserManager ??= new BrowserManager();
  const page = await sharedBrowserManager.createPage(true, undefined, true);
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 720 });

    // Anti-hotlink on XHS CDN often blocks "document navigation" but allows real <img> loads
    // from a XHS page. So we navigate to a referer page first, then load the image as a resource.
    try {
      await page.goto(referer || DEFAULT_REFERER, { waitUntil: 'domcontentloaded', timeout: DOWNLOAD_TIMEOUT_MS });
    } catch {
      // ignore warmup failures; still attempt to load image via DOM
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
          if (firstUrl !== url) return false;

          const status = r.status();
          if (status < 200 || status >= 400) return false;

          const headers = r.headers() || {};
          const contentType = String(headers['content-type'] || '').toLowerCase();
          return contentType.startsWith('image/');
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
    }, url);

    const response = await responsePromise;
    if (!response) {
      throw new Error('No response from browser');
    }
    const status = response.status();
    if (status >= 400) {
      const err = new Error(`Browser upstream error: ${status}`);
      (err as any).status = status;
      throw err;
    }

    const headers = response.headers() || {};
    const contentType = (headers['content-type'] as string) || 'application/octet-stream';
    const buffer = await response.buffer();
    if (buffer.length > MAX_BYTES) {
      throw new Error(`Image too large: ${buffer.length} bytes`);
    }

    return { buffer, contentType };
  } finally {
    try {
      await page.close();
    } catch {
      // ignore
    }
    release();
    scheduleBrowserCleanup();
  }
}

async function ensureCached(
  originalUrl: string,
  urlForFetch: string,
  referer: string
): Promise<{ dataPath: string; contentType: string }> {
  const cacheKey = sha256(originalUrl);
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const { dataPath, metaPath } = buildCachePaths(originalUrl);
    const meta = readMeta(metaPath);
    if (fs.existsSync(dataPath)) {
      return { dataPath, contentType: meta?.contentType || guessContentTypeFromExt(path.extname(dataPath).slice(1)) };
    }

    fs.mkdirSync(getCacheDir(), { recursive: true });

    try {
      const { buffer, contentType } = await downloadWithFetch(urlForFetch, referer);
      const tmpPath = `${dataPath}.tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, dataPath);
      writeMeta(metaPath, { contentType, originalUrl });
      return { dataPath, contentType };
    } catch (err: any) {
      const status = err?.status;
      if (status !== 403) throw err;

      // If direct fetch is blocked (hotlink/anti-scraping), try with a real browser session (cookies loaded).
      const { buffer, contentType } = await downloadWithBrowser(urlForFetch, referer);
      const tmpPath = `${dataPath}.tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, dataPath);
      writeMeta(metaPath, { contentType, originalUrl });
      return { dataPath, contentType };
    }
  })();

  inflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = req.query.url;
  if (!rawUrl || Array.isArray(rawUrl)) {
    return res.status(400).json({ error: 'url required' });
  }

  const referer = normalizeReferer(req.query.referer) || DEFAULT_REFERER;

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).json({ error: 'invalid protocol' });
  }

  if (isDisallowedLocalHostname(target.hostname) || !isAllowedHostname(target.hostname)) {
    return res.status(400).json({ error: 'host not allowed' });
  }

  try {
    const originalUrl = target.toString();
    const candidates: string[] = [];

    // Prefer HTTPS for xhscdn if input is HTTP.
    if (target.protocol === 'http:' && isAllowedHostname(target.hostname)) {
      const httpsUrl = new URL(originalUrl);
      httpsUrl.protocol = 'https:';
      candidates.push(httpsUrl.toString());
    }
    candidates.push(originalUrl);

    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        const { dataPath, contentType } = await ensureCached(originalUrl, candidate, referer);
        return serveFile(res, dataPath, contentType);
      } catch (e) {
        lastError = e;
      }
    }

    const status = Number((lastError as any)?.status || 502);
    return res.status(status).json({ error: (lastError as any)?.message || 'proxy failed' });
  } catch (error: any) {
    return res.status(502).json({ error: error?.message || 'proxy failed' });
  }
}

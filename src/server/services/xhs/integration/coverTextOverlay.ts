import puppeteer, { Browser } from 'puppeteer';

// Minimal, reliable cover text overlay: render the original image + headline/subline via Chromium
// and screenshot to a new PNG. This avoids font issues in pure image libraries for Chinese text.

export interface CoverTextOverlayInput {
  titleText: string;
  subtitleText?: string;
}

let browserPromise: Promise<Browser> | null = null;

function isTruthyEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  return fallback;
}

export function isCoverTextOverlayEnabled() {
  // Default OFF: prefer model-native typography (TITLE_SPEC / title-card reference).
  // Keep this as an emergency, opt-in fallback.
  return isTruthyEnv(process.env.XHS_COVER_TEXT_OVERLAY, false);
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clampText(input: string, maxLen: number) {
  const s = String(input || '').trim().replace(/\s+/g, ' ');
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)) + '…';
}

async function getOverlayBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });

    // Best-effort cleanup; this is a long-lived server process.
    const cleanup = async () => {
      try {
        const browser = await browserPromise;
        await browser.close();
      } catch {
        // ignore
      }
      browserPromise = null;
    };

    process.once('exit', () => {
      void cleanup();
    });
    process.once('SIGINT', () => {
      void cleanup();
    });
    process.once('SIGTERM', () => {
      void cleanup();
    });
  }

  return browserPromise;
}

function buildCoverHtml(params: {
  width: number;
  height: number;
  base64Png: string;
  titleText: string;
  subtitleText?: string;
}) {
  const { width, height, base64Png } = params;

  const title = escapeHtml(clampText(params.titleText, 40));
  const subtitle = params.subtitleText ? escapeHtml(clampText(params.subtitleText, 60)) : '';

  // Heuristics tuned for 3:4 XHS covers (e.g. 1728x2304). Keep a generous safe area.
  const pad = Math.round(width * 0.06);
  const panelMaxWidth = Math.round(width * 0.86);
  const titleSize = Math.max(64, Math.min(120, Math.round(width * 0.068)));
  const subtitleSize = Math.max(32, Math.min(54, Math.round(width * 0.034)));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, height=${height}, initial-scale=1" />
<style>
  html, body { width: ${width}px; height: ${height}px; margin: 0; padding: 0; overflow: hidden; }
  body { background: #000; }
  #root { position: relative; width: 100%; height: 100%; }
  #bg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }

  .overlay { position: absolute; left: 0; top: 0; right: 0; pointer-events: none; }
  .panel {
    position: absolute;
    left: ${pad}px;
    top: ${pad}px;
    max-width: ${panelMaxWidth}px;
    padding: ${Math.round(pad * 0.7)}px ${Math.round(pad * 0.8)}px;
    border-radius: ${Math.round(pad * 0.6)}px;
    background: rgba(0, 0, 0, 0.55);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  }

  .title {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif;
    font-weight: 800;
    font-size: ${titleSize}px;
    line-height: 1.06;
    letter-spacing: 0.5px;
    color: #fff;
    text-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .subtitle {
    margin-top: ${Math.round(pad * 0.35)}px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif;
    font-weight: 600;
    font-size: ${subtitleSize}px;
    line-height: 1.25;
    color: rgba(255,255,255,0.92);
    text-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
</style>
</head>
<body>
  <div id="root">
    <img id="bg" alt="bg" src="data:image/png;base64,${base64Png}" />
    <div class="overlay">
      <div class="panel">
        <div class="title">${title}</div>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function applyCoverTextOverlay(
  imageBuffer: Buffer,
  overlay: CoverTextOverlayInput
): Promise<Buffer> {
  const titleText = String(overlay?.titleText || '').trim();
  if (!titleText) return imageBuffer;

  const { Jimp } = await import('jimp');

  // Normalize to PNG first (ensures data URL works consistently across providers).
  const base = await Jimp.read(imageBuffer);
  const width = base.bitmap.width;
  const height = base.bitmap.height;
  const basePng = Buffer.from(await base.getBuffer('image/png'));
  const base64Png = basePng.toString('base64');

  const browser = await getOverlayBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const html = buildCoverHtml({
      width,
      height,
      base64Png,
      titleText,
      subtitleText: overlay.subtitleText,
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Ensure background image is decoded before screenshot.
    await page.waitForFunction(() => {
      const img = document.getElementById('bg');
      if (!img) return false;
      const el = img as HTMLImageElement;
      return el.complete && el.naturalWidth > 0;
    }, { timeout: 10_000 });

    const out = await page.screenshot({ type: 'png' });
    return Buffer.from(out);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export const __testOnly = {
  buildCoverHtml,
};

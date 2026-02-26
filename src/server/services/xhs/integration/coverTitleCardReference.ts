import puppeteer, { Browser } from 'puppeteer';

export interface CoverTitleCardSpec {
  headline: string;
  subline?: string;
  width?: number;
  height?: number;
}

let browserPromise: Promise<Browser> | null = null;

function isTruthyEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  return fallback;
}

export function isCoverTitleCardReferenceEnabled() {
  // Default ON: still model-native (the model blends the text), but more reliable than prompting-only.
  return isTruthyEnv(process.env.XHS_COVER_TITLE_CARD_REFERENCE, true);
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

async function getBrowser(): Promise<Browser> {
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

function buildTitleCardHtml(params: {
  width: number;
  height: number;
  headline: string;
  subline?: string;
}) {
  const { width, height } = params;
  const pad = Math.round(width * 0.06);
  const panelMaxWidth = Math.round(width * 0.88);

  const headline = escapeHtml(clampText(params.headline, 18));
  const subline = params.subline ? escapeHtml(clampText(params.subline, 26)) : '';

  const headlineSize = Math.max(54, Math.min(92, Math.round(width * 0.095)));
  const sublineSize = Math.max(28, Math.min(44, Math.round(width * 0.05)));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, height=${height}, initial-scale=1" />
<style>
  html, body { width: ${width}px; height: ${height}px; margin: 0; padding: 0; overflow: hidden; }
  body {
    background: radial-gradient(900px 600px at 20% 10%, #2a2a36 0%, #14141a 55%, #0d0d11 100%);
  }
  #root { position: relative; width: 100%; height: 100%; }
  .panel {
    position: absolute;
    left: ${pad}px;
    top: ${pad}px;
    max-width: ${panelMaxWidth}px;
    padding: ${Math.round(pad * 0.9)}px ${Math.round(pad * 0.95)}px;
    border-radius: ${Math.round(pad * 0.7)}px;
    background: linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.50) 100%);
    box-shadow: 0 18px 50px rgba(0,0,0,0.40);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .headline {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif;
    font-weight: 900;
    font-size: ${headlineSize}px;
    line-height: 1.06;
    letter-spacing: 0.5px;
    color: #ffffff;
    text-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .subline {
    margin-top: ${Math.round(pad * 0.45)}px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif;
    font-weight: 650;
    font-size: ${sublineSize}px;
    line-height: 1.20;
    letter-spacing: 0.2px;
    color: rgba(255,255,255,0.92);
    text-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .hint {
    position: absolute;
    left: ${pad}px;
    bottom: ${pad}px;
    right: ${pad}px;
    font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 16px;
    color: rgba(255,255,255,0.22);
    letter-spacing: 0.4px;
  }
</style>
</head>
<body>
  <div id="root">
    <div class="panel">
      <div class="headline">${headline}</div>
      ${subline ? `<div class="subline">${subline}</div>` : ''}
    </div>
    <div class="hint">TITLE CARD (reference only)</div>
  </div>
</body>
</html>`;
}

export async function generateCoverTitleCardPng(spec: CoverTitleCardSpec): Promise<Buffer> {
  const headline = String(spec?.headline || '').trim();
  if (!headline) {
    throw new Error('TITLE_CARD_MISSING_HEADLINE');
  }

  const width = Math.max(360, Math.min(2048, Math.floor(spec.width || 768)));
  const height = Math.max(480, Math.min(3072, Math.floor(spec.height || 1024)));

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const html = buildTitleCardHtml({
      width,
      height,
      headline,
      subline: spec.subline,
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Give the browser a moment to settle layout and font fallback.
    await new Promise((r) => setTimeout(r, 80));

    const out = await page.screenshot({ type: 'png' });
    return Buffer.from(out);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function coverTitleCardToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

export const __testOnly = {
  buildTitleCardHtml,
};

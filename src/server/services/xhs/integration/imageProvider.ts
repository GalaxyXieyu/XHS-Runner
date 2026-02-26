import crypto from 'crypto';
import { generateArkImage } from './arkImageClient';
import { generateContent } from './nanobananaClient';
import { getSetting } from '../../../settings';
import { getExtensionServiceByType } from '../../extensionService';

export type ImageModel = 'nanobanana' | 'jimeng' | 'ark';

export interface ImageGenerateInput {
  prompt: string;
  model?: ImageModel;
  images?: string[];
}

export interface ImageGenerateResult {
  text: string;
  imageBuffer: Buffer;
  metadata: Record<string, any>;
}

const HOST = 'visual.volcengineapi.com';
const REGION = 'cn-north-1';
const SERVICE = 'cv';
const VERSION = '2022-08-31';
const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

// Ark image defaults (Seedream).
const DEFAULT_ARK_IMAGE_MODEL = 'doubao-seedream-5-0-260128';
const DEFAULT_ARK_IMAGE_SIZE = '1728x2304';

// Jimeng 图片生成串行队列（避免并发限流）
class JimengApiLock {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await execute();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      await task();
    }
    this.isProcessing = false;
  }
}

const jimengApiLock = new JimengApiLock();

function sign(key: Buffer, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = sign(Buffer.from(secretKey, 'utf-8'), dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  return sign(kService, 'request');
}

function generateVolcengineSignature(
  method: string,
  path: string,
  query: string,
  headers: Record<string, string>,
  body: string,
  timestamp: string,
  secretKey: string,
  accessKey: string
): string {
  const sortedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaders
    .map(key => `${key.toLowerCase()}:${headers[key].trim()}`)
    .join('\n') + '\n';
  const signedHeaders = sortedHeaders.map(key => key.toLowerCase()).join(';');
  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const date = timestamp.substring(0, 8);
  const credentialScope = `${date}/${REGION}/${SERVICE}/request`;
  const stringToSign = ['HMAC-SHA256', timestamp, credentialScope, hashedCanonicalRequest].join('\n');
  const signingKey = getSignatureKey(secretKey, date, REGION, SERVICE);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function fetchWithRetry(url: string, options: RequestInit, timeout = 60000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error('All retries failed');
}

async function postJson<T>(url: string, data: any, headers: Record<string, string>, timeout = 60000): Promise<T> {
  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    },
    timeout,
    1
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return response.json();
}

function stripBase64Header(base64: string) {
  return base64.replace(/^data:image\/[^;]+;base64,/, '');
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLikelyUnreliableForJimengPull(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (host === 'raw.githubusercontent.com') return true;
    if (host === 'github.com' && (path.includes('/raw/') || path.includes('/blob/'))) return true;
    if (host.endsWith('githubusercontent.com')) return true;
  } catch {
    // Ignore invalid URL parsing.
  }
  return /raw\.githubusercontent\.com|raw\.github\.com|github\.com\//i.test(url);
}

async function isDirect200ImageUrl(url: string) {
  try {
    const res = await fetchWithRetry(url, { method: 'HEAD', redirect: 'manual' }, 15000, 0);
    if (res.status !== 200) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

async function rehostRemoteImageToSuperbed(url: string, superbedToken?: string) {
  const response = await fetchWithRetry(url, { method: 'GET' }, 60000, 1);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`REF_IMAGE_DOWNLOAD_FAILED: HTTP ${response.status} ${body}`.trim());
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString('base64');
  return uploadBase64ToSuperbed(base64, `jimeng-ref-${Date.now()}.png`, superbedToken);
}

async function normalizeJimengReferenceImageUrl(url: string, superbedToken?: string) {
  if (!isHttpUrl(url)) return url;

  const shouldRehost = isLikelyUnreliableForJimengPull(url);
  const isDirect = !shouldRehost && (await isDirect200ImageUrl(url));
  if (isDirect) return url;

  if (!superbedToken) {
    console.warn(`[Jimeng] reference image URL may be non-direct, but SUPERBED_TOKEN is missing; keep original: ${url}`);
    return url;
  }

  try {
    const directUrl = await rehostRemoteImageToSuperbed(url, superbedToken);
    console.log(`[Jimeng] rehosted reference image to: ${directUrl}`);
    return directUrl;
  } catch (e: any) {
    console.warn(`[Jimeng] failed to rehost reference image, keep original: ${url}. err=${e?.message || String(e)}`);
    return url;
  }
}

function readEnvString(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function readEnvBoolean(keys: string[], fallback: boolean) {
  const raw = readEnvString(...keys);
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw.toLowerCase());
}

export async function uploadBase64ToSuperbed(base64: string, filename: string, token?: string): Promise<string> {
  let resolvedToken = token;

  if (!resolvedToken) {
    try {
      // 尝试从 extension_services 获取
      const service = await getExtensionServiceByType('imagehost');
      if (service?.api_key) {
        resolvedToken = service.api_key;
      }
    } catch { }
  }

  if (!resolvedToken) {
    try {
      // 尝试从 settings 获取
      resolvedToken = await getSetting('superbedToken') || "";
    } catch { }
  }

  if (!resolvedToken) {
    throw new Error('SUPERBED_NOT_CONFIGURED: 请先配置 Superbed Token');
  }
  const cleanBase64 = stripBase64Header(base64);
  let buffer = Buffer.from(cleanBase64, 'base64');

  // 如果图片太大，尝试压缩
  const MAX_SIZE = 500 * 1024; // 500KB
  if (buffer.length > MAX_SIZE) {
    try {
      const { Jimp } = await import('jimp');
      const image = await Jimp.read(buffer);
      if (image.width > 1024) {
        image.resize({ w: 1024 });
      }
      buffer = Buffer.from(await image.getBuffer('image/jpeg'));
    } catch (e) {
      console.error('[uploadBase64ToSuperbed] Compression failed:', e);
    }
  }

  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', blob, filename.replace('.png', '.jpg'));

  const response = await fetch(`https://api.superbed.cn/upload?token=${resolvedToken}`, {
    method: 'POST',
    body: formData,
  });
  const result = await response.json();
  if (result.err !== 0 || !result.url) {
    throw new Error(`superbed上传失败：${result.msg || '未知错误'}`);
  }

  // Superbed 返回的 URL 会 302 重定向到百度云 CDN
  // 即梦服务器无法跟随重定向，需要手动解析获取最终直链
  const superbedUrl = result.url;
  try {
    const redirectRes = await fetch(superbedUrl, { method: 'HEAD', redirect: 'manual' });
    const directUrl = redirectRes.headers.get('location');
    if (directUrl && directUrl.startsWith('http')) {
      // Redirect resolved silently
      return directUrl;
    }
  } catch (e) {
    console.warn('[uploadBase64ToSuperbed] 重定向解析失败，使用原 URL:', e);
  }
  return superbedUrl;
}

async function generateJimengImage(params: {
  prompt: string;
  images?: string[];
  accessKey: string;
  secretKey: string;
  superbedToken?: string;
}): Promise<ImageGenerateResult> {
  const { prompt, images, accessKey, secretKey, superbedToken } = params;
  if (!accessKey || !secretKey) {
    throw new Error('VOLCENGINE_NOT_CONFIGURED:请先配置火山引擎 Access Key 和 Secret Key');
  }

  return jimengApiLock.enqueue(async () => {
    const imageUrls: string[] = [];
    if (Array.isArray(images) && images.length > 0) {
      for (const image of images) {
        const normalized = String(image || '').trim();
        if (!normalized) continue;
        if (isHttpUrl(normalized)) {
          imageUrls.push(await normalizeJimengReferenceImageUrl(normalized, superbedToken));
          continue;
        }
        const url = await uploadBase64ToSuperbed(image, `jimeng-${Date.now()}.png`, superbedToken);
        imageUrls.push(url);
      }
    }

    const requestBody: any = {
      req_key: 'jimeng_t2i_v40',
      req_json: '{}',
      prompt,
      width: 1536,   // 3:4 竖版比例，适合小红书
      height: 2048,
      scale: 0.5,
      force_single: true,
    };
    if (imageUrls.length > 0) {
      requestBody.image_urls = imageUrls;
    }

    const bodyStr = JSON.stringify(requestBody);
    const timestamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '').replace('Z', '') + 'Z';
    const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Host': HOST,
      'X-Date': timestamp,
      'X-Content-Sha256': payloadHash,
    };

    const query = `Action=CVProcess&Version=${VERSION}`;
    headers['Authorization'] = generateVolcengineSignature(
      'POST',
      '/',
      query,
      headers,
      bodyStr,
      timestamp,
      secretKey,
      accessKey
    );

    const apiUrl = `https://${HOST}/?${query}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result: any = await postJson(apiUrl, requestBody, headers, 120000);
        if (result.code !== 10000) {
          throw new Error(`即梦API调用失败: code=${result.code}, msg=${result.message || 'Unknown'}`);
        }
        const base64 = result.data?.binary_data_base64?.[0];
        if (!base64) {
          throw new Error('即梦API返回空结果');
        }
        const imageBuffer = Buffer.from(base64, 'base64');
        console.log(`[Jimeng] 图片生成成功 (${Math.round(imageBuffer.length / 1024)}KB)`);
        return {
          text: '',
          imageBuffer,
          metadata: {
            model: 'jimeng_t2i_v40',
            prompt,
            imageUrls,
            // Jimeng uses a fixed 3:4 canvas for now.
            size: '1536x2048',
            aspectRatio: '3:4',
          },
        };
      } catch (error: any) {
        const message = error?.message || String(error);
        lastError = error instanceof Error ? error : new Error(message);

        const retryable = /50430|50220|Download\s*Url\s*Error|Concurrent\s*Limit|CONCURRENT_LIMIT|HTTP\s*429|\b429\b|timeout|ECONNRESET|ETIMEDOUT|\b5\d\d\b/i.test(message);
        const isLastAttempt = attempt === 3;
        if (!retryable || isLastAttempt) {
          break;
        }

        const is429 = /Concurrent\s*Limit|CONCURRENT_LIMIT|HTTP\s*429|\b429\b/i.test(message);
        const jitter = Math.floor(Math.random() * 500);
        const base = is429 ? 4000 : 1000;
        const cap = is429 ? 30000 : 8000;
        const delayMs = Math.min(cap, base * Math.pow(2, attempt)) + jitter;
        console.warn(`[Jimeng] retryable error, backoff ${delayMs}ms (attempt ${attempt + 1}/4): ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError || new Error('即梦API调用失败');
  });
}

async function getJimengConfig() {
  let accessKey = readEnvString('VOLCENGINE_ACCESS_KEY');
  let secretKey = readEnvString('VOLCENGINE_SECRET_KEY');
  let superbedToken = readEnvString('SUPERBED_TOKEN');

  if (!accessKey || !secretKey || !superbedToken) {
    try {
      // 优先从 extension_services 表读取
      const [imageService, imagehostService] = await Promise.all([
        getExtensionServiceByType('image'),
        getExtensionServiceByType('imagehost')
      ]);

      if (imageService?.config_json) {
        try {
          const config = JSON.parse(imageService.config_json);
          accessKey = accessKey || config.volcengine_access_key || '';
          secretKey = secretKey || config.volcengine_secret_key || '';
        } catch { }
      }

      if (imagehostService?.api_key) {
        superbedToken = superbedToken || imagehostService.api_key;
      }
    } catch {
      // Ignore missing extension services
    }
  }

  if (!accessKey || !secretKey || !superbedToken) {
    try {
      // Fallback 到 settings 表
      const [fallbackAccessKey, fallbackSecretKey, fallbackSuperbedToken] = await Promise.all([
        getSetting('volcengineAccessKey'),
        getSetting('volcengineSecretKey'),
        getSetting('superbedToken')
      ]);

      accessKey = accessKey || fallbackAccessKey || '';
      secretKey = secretKey || fallbackSecretKey || '';
      superbedToken = superbedToken || fallbackSuperbedToken || '';
    } catch {
      // Ignore missing settings db
    }
  }

  return { accessKey, secretKey, superbedToken };
}

async function normalizeSeedreamImages(images: string[] | undefined, superbedToken?: string) {
  if (!Array.isArray(images) || images.length === 0) return undefined;

  const output: string[] = [];
  for (const image of images) {
    const normalized = String(image || '').trim();
    if (!normalized) continue;
    if (normalized.startsWith('data:image/')) {
      output.push(normalized);
      continue;
    }
    if (isHttpUrl(normalized)) {
      // Ensure the provider can pull it (no redirects / GitHub raw timeouts).
      output.push(await normalizeJimengReferenceImageUrl(normalized, superbedToken));
      continue;
    }
    if (superbedToken) {
      const url = await uploadBase64ToSuperbed(normalized, `seedream-${Date.now()}.png`, superbedToken);
      output.push(url);
      continue;
    }
    output.push(`data:image/png;base64,${normalized}`);
  }

  if (output.length === 0) return undefined;
  return output.length === 1 ? output[0] : output;
}

async function fetchImageBuffer(url: string) {
  const response = await fetchWithRetry(url, { method: 'GET' }, 60000, 1);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Seedream图片下载失败: HTTP ${response.status} ${body}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

async function getSeedreamConfig() {
  let apiKey = readEnvString('ARK_API_KEY', 'IMAGE_API_KEY');
  let baseUrl = readEnvString('ARK_IMAGE_BASE_URL', 'ARK_BASE_URL');
  let model = readEnvString('SEEDREAM_MODEL', 'ARK_IMAGE_MODEL');
  let size = readEnvString('SEEDREAM_SIZE', 'ARK_IMAGE_SIZE');
  let watermark = readEnvBoolean(['SEEDREAM_WATERMARK', 'ARK_IMAGE_WATERMARK'], false);
  let superbedToken = readEnvString('SUPERBED_TOKEN');

  try {
    const [imageService, imagehostService] = await Promise.all([
      getExtensionServiceByType('image'),
      getExtensionServiceByType('imagehost')
    ]);

    if (imageService) {
      if (!apiKey && imageService.api_key) {
        apiKey = String(imageService.api_key || '').trim();
      }
      if (!baseUrl && imageService.endpoint) {
        baseUrl = String(imageService.endpoint || '').trim();
      }
      if (imageService.config_json) {
        try {
          const config = JSON.parse(imageService.config_json);
          apiKey = apiKey || config.jimeng_api_key || config.ark_api_key || config.image_api_key || config.api_key || '';
          baseUrl = baseUrl || config.ark_base_url || config.ark_image_base_url || config.base_url || '';
          model = model || config.seedream_model || config.model || '';
          size = size || config.seedream_size || config.size || '';
          if (typeof config.seedream_watermark === 'boolean') {
            watermark = config.seedream_watermark;
          }
        } catch {
          // Ignore invalid config
        }
      }
    }

    if (!superbedToken && imagehostService?.api_key) {
      superbedToken = imagehostService.api_key;
    }
  } catch {
    // Ignore missing extension services
  }

  try {
    const [fallbackJimengApiKey, fallbackImageKey, fallbackSeedreamModel, fallbackSeedreamSize, fallbackSuperbedToken] = await Promise.all([
      getSetting('jimeng_api_key'),
      getSetting('imageKey'),
      getSetting('seedream_model'),
      getSetting('seedream_size'),
      getSetting('superbedToken')
    ]);
    apiKey = apiKey || fallbackJimengApiKey || fallbackImageKey || '';
    model = model || fallbackSeedreamModel || '';
    size = size || fallbackSeedreamSize || '';
    superbedToken = superbedToken || fallbackSuperbedToken || '';
  } catch {
    // Ignore missing settings db
  }

  return {
    apiKey,
    baseUrl: baseUrl || DEFAULT_ARK_BASE_URL,
    model: model || DEFAULT_ARK_IMAGE_MODEL,
    size: size || DEFAULT_ARK_IMAGE_SIZE,
    watermark,
    superbedToken,
  };
}

async function generateSeedreamImage(params: {
  prompt: string;
  images?: string[];
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
  watermark: boolean;
  superbedToken?: string;
}): Promise<ImageGenerateResult> {
  const { prompt, images, apiKey, baseUrl, model, size, watermark, superbedToken } = params;
  if (!apiKey) {
    throw new Error('ARK_API_KEY_NOT_CONFIGURED: 请先配置 ARK_API_KEY / IMAGE_API_KEY');
  }

  const imagePayload = await normalizeSeedreamImages(images, superbedToken);
  const referenceImages =
    typeof imagePayload === 'string'
      ? [imagePayload]
      : Array.isArray(imagePayload)
        ? imagePayload
        : undefined;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await generateArkImage({
        apiKey,
        baseUrl,
        model,
        prompt,
        size,
        watermark,
        responseFormat: 'url',
        referenceImages,
      });

      const providerUrl = result.urls[0];
      const providerB64 = result.b64Json[0];

      let imageBuffer: Buffer | null = null;
      if (providerUrl) {
        imageBuffer = await fetchImageBuffer(providerUrl);
      } else if (providerB64) {
        imageBuffer = Buffer.from(providerB64, 'base64');
      }

      if (!imageBuffer) {
        throw new Error('Ark 返回结果缺少图片数据');
      }

      const raw = result.raw;
      const first = Array.isArray(raw?.data) ? raw.data[0] : undefined;
      return {
        text: '',
        imageBuffer,
        metadata: {
          mimeType: 'image/jpeg',
          model: raw?.model || model,
          prompt,
          size: first?.size || size,
          watermark,
          usage: raw?.usage,
          created: raw?.created,
          url: providerUrl,
        },
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      lastError = error instanceof Error ? error : new Error(message);

      const retryable = /50430|50220|Download\s*Url\s*Error|Concurrent\s*Limit|CONCURRENT_LIMIT|HTTP\s*429|\b429\b|timeout|ECONNRESET|ETIMEDOUT|\b5\d\d\b/i.test(message);
      const isLastAttempt = attempt === 3;
      if (!retryable || isLastAttempt) {
        break;
      }

      const is429 = /Concurrent\s*Limit|CONCURRENT_LIMIT|HTTP\s*429|\b429\b/i.test(message);
      const jitter = Math.floor(Math.random() * 500);
      const base = is429 ? 4000 : 1000;
      const cap = is429 ? 30000 : 8000;
      const delayMs = Math.min(cap, base * Math.pow(2, attempt)) + jitter;
      console.warn(`[Ark] retryable error, backoff ${delayMs}ms (attempt ${attempt + 1}/4): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Ark 调用失败');
}

export async function generateImage(input: ImageGenerateInput): Promise<ImageGenerateResult> {
  const model = input.model || 'nanobanana';
  if (model === 'jimeng') {
    const { accessKey, secretKey, superbedToken } = await getJimengConfig();
    return generateJimengImage({
      prompt: input.prompt,
      images: input.images,
      accessKey,
      secretKey,
      superbedToken,
    });
  }
  if (model === 'ark') {
    const { apiKey, baseUrl, model: modelId, size, watermark, superbedToken } = await getSeedreamConfig();
    return generateSeedreamImage({
      prompt: input.prompt,
      images: input.images,
      apiKey,
      baseUrl,
      model: modelId,
      size,
      watermark,
      superbedToken,
    });
  }

  const result = await generateContent(input.prompt);
  return {
    text: result.text || '',
    imageBuffer: result.imageBuffer,
    metadata: { model: 'nanobanana', ...result.metadata },
  };
}

// ============ 带参考图生成接口 ============

export type ReferenceImageProvider = 'ark' | 'gemini' | 'jimeng';

// Evidence-only helper: expose non-secret runtime info for provider/model.
export async function getImageGenRuntimeInfo(provider: ReferenceImageProvider): Promise<{
  provider: ReferenceImageProvider;
  imageModel?: string;
  size?: string;
  watermark?: boolean;
}> {
  if (provider === 'ark') {
    const cfg = await getSeedreamConfig();
    return { provider, imageModel: cfg.model, size: cfg.size, watermark: cfg.watermark };
  }
  if (provider === 'jimeng') {
    // Jimeng canvas/model are effectively fixed in our integration.
    return { provider, imageModel: 'jimeng_t2i_v40', size: '1536x2048', watermark: false };
  }
  // Gemini model selection can be DB/env driven; keep it empty here.
  return { provider };
}


export interface ReferenceImageInput {
  prompt: string;
  referenceImageUrls: string[]; // 支持多张参考图
  provider?: ReferenceImageProvider; // 不传则从设置读取
  aspectRatio?: string;
}

export interface ReferenceImageResult {
  imageBuffer: Buffer;
  provider: string;
  metadata?: Record<string, any>;
}

/**
 * 带参考图生成图片 - 统一接口
 * 支持多种模型，可通过设置或参数切换
 */
export async function generateImageWithReference(input: ReferenceImageInput): Promise<ReferenceImageResult> {
  // 优先使用参数指定的 provider，否则从设置读取
  const provider = input.provider || (await getSetting('imageGenProvider')) || 'ark';

  switch (provider) {
    case 'ark':
      return generateWithArk(input);
    case 'jimeng':
      return generateWithJimeng(input);
    case 'gemini':
    default:
      return generateWithGemini(input);
  }
}

// Gemini 实现
async function generateWithGemini(input: ReferenceImageInput): Promise<ReferenceImageResult> {
  const { generateImageWithReference: geminiGenerate } = await import('../llm/geminiClient');
  const result = await geminiGenerate({
    prompt: input.prompt,
    referenceImageUrls: input.referenceImageUrls, // 支持多张参考图
    aspectRatio: input.aspectRatio || '3:4',
  });
  return {
    imageBuffer: Buffer.from(result.imageBase64, 'base64'),
    provider: 'gemini',
    metadata: { mimeType: result.mimeType },
  };
}

// Jimeng 实现
async function generateWithJimeng(input: ReferenceImageInput): Promise<ReferenceImageResult> {
  const { accessKey, secretKey, superbedToken } = await getJimengConfig();
  const result = await generateJimengImage({
    prompt: input.prompt,
    images: input.referenceImageUrls, // 支持多张参考图，直接传递数组
    accessKey,
    secretKey,
    superbedToken,
  });
  return {
    imageBuffer: result.imageBuffer,
    provider: 'jimeng',
    metadata: result.metadata,
  };
}

// Ark (Seedream) 实现
async function generateWithArk(input: ReferenceImageInput): Promise<ReferenceImageResult> {
  const { apiKey, baseUrl, model, size, watermark, superbedToken } = await getSeedreamConfig();
  const result = await generateSeedreamImage({
    prompt: input.prompt,
    images: input.referenceImageUrls,
    apiKey,
    baseUrl,
    model,
    size,
    watermark,
    superbedToken,
  });
  return {
    imageBuffer: result.imageBuffer,
    provider: 'ark',
    metadata: result.metadata,
  };
}

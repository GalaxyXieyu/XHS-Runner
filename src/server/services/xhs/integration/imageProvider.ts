import crypto from 'crypto';
import { generateContent } from './nanobananaClient';
import { getSetting } from '../../../settings';
import { getExtensionServiceByType } from '../../extensionService';

export type ImageModel = 'nanobanana' | 'jimeng' | 'jimeng-45';

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
const DEFAULT_SEEDREAM_45_MODEL = 'doubao-seedream-4.5';
const DEFAULT_SEEDREAM_45_SIZE = '1728x2304';

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
          imageUrls.push(normalized);
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt > 0) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
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
          metadata: { model: 'jimeng_t2i_v40', prompt, imageUrls },
        };
      } catch (error: any) {
        const message = error.message || String(error);
        lastError = error instanceof Error ? error : new Error(message);
        const retryable = /CONCURRENT_LIMIT|429|timeout|ECONNRESET|ETIMEDOUT|500|503|504/i.test(message);
        if (!retryable || attempt === 2) {
          break;
        }
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
    if (isHttpUrl(normalized) || normalized.startsWith('data:image/')) {
      output.push(normalized);
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
  let apiKey = readEnvString('JIMENG_API_KEY', 'ARK_API_KEY', 'IMAGE_API_KEY', 'VOLCENGINE_IMAGE_KEY');
  let baseUrl = readEnvString('ARK_IMAGE_BASE_URL', 'ARK_BASE_URL');
  let model = readEnvString('SEEDREAM_45_MODEL', 'ARK_IMAGE_MODEL');
  let size = readEnvString('SEEDREAM_45_SIZE', 'ARK_IMAGE_SIZE');
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
          model = model || config.seedream_model || config.seedream_45_model || config.model || '';
          size = size || config.seedream_size || config.seedream_45_size || config.size || '';
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
    const [fallbackJimengApiKey, fallbackImageKey, fallbackSeedreamModel, fallbackSuperbedToken] = await Promise.all([
      getSetting('jimeng_api_key'),
      getSetting('imageKey'),
      getSetting('seedream_45_model'),
      getSetting('superbedToken')
    ]);
    apiKey = apiKey || fallbackJimengApiKey || fallbackImageKey || '';
    model = model || fallbackSeedreamModel || '';
    superbedToken = superbedToken || fallbackSuperbedToken || '';
  } catch {
    // Ignore missing settings db
  }

  return {
    apiKey,
    baseUrl: baseUrl || DEFAULT_ARK_BASE_URL,
    model: model || DEFAULT_SEEDREAM_45_MODEL,
    size: size || DEFAULT_SEEDREAM_45_SIZE,
    watermark,
    superbedToken,
  };
}

async function generateSeedream45Image(params: {
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
    throw new Error('JIMENG_API_KEY_NOT_CONFIGURED: 请先配置即梦 4.5 API Key（Ark）');
  }

  const imagePayload = await normalizeSeedreamImages(images, superbedToken);
  const requestBody: Record<string, any> = {
    model,
    prompt,
    response_format: 'b64_json',
    sequential_image_generation: 'disabled',
    size,
    stream: false,
    watermark,
  };

  if (imagePayload) {
    requestBody.image = imagePayload;
  }

  const result: any = await postJson(
    baseUrl,
    requestBody,
    {
      Authorization: `Bearer ${apiKey}`,
    },
    120000
  );

  if (result?.error) {
    const message = result.error?.message || 'Seedream API error';
    throw new Error(`Seedream 4.5 调用失败: ${message}`);
  }

  const dataList = Array.isArray(result?.data) ? result.data : [];
  if (dataList.length === 0) {
    throw new Error('Seedream 4.5 返回空结果');
  }

  const item = dataList.find((entry: any) => entry?.b64_json || entry?.url || entry?.error) || dataList[0];
  if (item?.error) {
    const code = item.error?.code || 'unknown';
    const message = item.error?.message || 'Unknown';
    throw new Error(`Seedream 4.5 生成失败: code=${code}, msg=${message}`);
  }

  let imageBuffer: Buffer | null = null;
  if (item?.b64_json) {
    imageBuffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    imageBuffer = await fetchImageBuffer(String(item.url));
  }

  if (!imageBuffer) {
    throw new Error('Seedream 4.5 返回结果缺少图片数据');
  }

  return {
    text: '',
    imageBuffer,
    metadata: {
      mimeType: 'image/jpeg',
      model: result?.model || model,
      prompt,
      size: item?.size || size,
      usage: result?.usage,
      created: result?.created,
    },
  };
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
  if (model === 'jimeng-45') {
    const { apiKey, baseUrl, model: modelId, size, watermark, superbedToken } = await getSeedreamConfig();
    return generateSeedream45Image({
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

export type ReferenceImageProvider = 'gemini' | 'jimeng' | 'jimeng-45';

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
  const provider = input.provider || (await getSetting('imageGenProvider')) || 'gemini';

  switch (provider) {
    case 'jimeng-45':
      return generateWithJimeng45(input);
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

// Jimeng 4.5 (Ark) 实现
async function generateWithJimeng45(input: ReferenceImageInput): Promise<ReferenceImageResult> {
  const { apiKey, baseUrl, model, size, watermark, superbedToken } = await getSeedreamConfig();
  const result = await generateSeedream45Image({
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
    provider: 'jimeng-45',
    metadata: result.metadata,
  };
}

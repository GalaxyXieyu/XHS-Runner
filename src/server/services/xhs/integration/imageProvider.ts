import crypto from 'crypto';
import { generateContent } from './nanobananaClient';
import { getSetting } from '../../../settings';
import { getExtensionServiceByType } from '../../extensionService';

export type ImageModel = 'nanobanana' | 'jimeng';

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

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function uploadBase64ToSuperbed(base64: string, filename: string, token?: string): Promise<string> {
  const resolvedToken = token || process.env.SUPERBED_TOKEN;
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
  return result.url;
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
        const result: any = await postJson(apiUrl, requestBody, headers, 60000);
        if (result.code !== 10000) {
          throw new Error(`即梦API调用失败: code=${result.code}, msg=${result.message || 'Unknown'}`);
        }
        const base64 = result.data?.binary_data_base64?.[0];
        if (!base64) {
          throw new Error('即梦API返回空结果');
        }
        return {
          text: '',
          imageBuffer: Buffer.from(base64, 'base64'),
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
  let accessKey = String(process.env.VOLCENGINE_ACCESS_KEY || '').trim();
  let secretKey = String(process.env.VOLCENGINE_SECRET_KEY || '').trim();
  let superbedToken = String(process.env.SUPERBED_TOKEN || '').trim();

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
        } catch {}
      }

      if (imagehostService?.api_key) {
        superbedToken = superbedToken || imagehostService.api_key;
      }
    } catch {
      // Ignore missing supabase / extension services
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

  const result = await generateContent(input.prompt);
  return {
    text: result.text || '',
    imageBuffer: result.imageBuffer,
    metadata: { model: 'nanobanana', ...result.metadata },
  };
}

// ============ 带参考图生成接口 ============

export type ReferenceImageProvider = 'gemini' | 'jimeng';

export interface ReferenceImageInput {
  prompt: string;
  referenceImageUrl: string;
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
    referenceImageUrl: input.referenceImageUrl,
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
    images: [input.referenceImageUrl],
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

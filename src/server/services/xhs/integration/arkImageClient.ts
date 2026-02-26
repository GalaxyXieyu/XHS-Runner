import { createConcurrencyLimiter } from '../../../utils/concurrency';

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_TIMEOUT_MS = 120000;

// Keep runtime concurrency bounded without globally serializing requests.
const limitArk = createConcurrencyLimiter(4);

export type ArkImageResponseFormat = 'url' | 'b64_json';

export interface ArkImageGenerateParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  size: string;
  watermark: boolean;
  timeoutMs?: number;
  responseFormat?: ArkImageResponseFormat;
  referenceImages?: string[];
}

export interface ArkImageGenerateResult {
  urls: string[];
  b64Json: string[];
  raw: any;
}

function normalizeReferenceImagesInput(value: any): string[] | undefined {
  if (Array.isArray(value)) {
    const out = value.map((v) => String(v || '').trim()).filter(Boolean);
    return out.length ? out : undefined;
  }
  if (typeof value === 'string') {
    const v = value.trim();
    return v ? [v] : undefined;
  }
  return undefined;
}

function toArkImagePayload(referenceImages: string[] | undefined) {
  if (!referenceImages || referenceImages.length === 0) return undefined;
  if (referenceImages.length === 1) return referenceImages[0];
  return referenceImages;
}

async function postJson(url: string, body: any, headers: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`.trim());
    }

    return res.json();
  } finally {
    clearTimeout(t);
  }
}

function normalizeArkResult(result: any) {
  if (result?.error) {
    const message = result.error?.message || 'Ark image generations error';
    throw new Error(`Ark image generations failed: ${message}`);
  }

  const dataList = Array.isArray(result?.data) ? result.data : [];
  if (dataList.length === 0) {
    throw new Error('Ark image generations returned empty data');
  }

  const errorItem = dataList.find((e: any) => e?.error);
  if (errorItem?.error) {
    const code = errorItem.error?.code || 'unknown';
    const message = errorItem.error?.message || 'Unknown';
    throw new Error(`Ark image generation failed: code=${code}, msg=${message}`);
  }

  const urls = dataList
    .map((e: any) => (typeof e?.url === 'string' ? e.url : null))
    .filter((u: string | null) => !!u) as string[];

  const b64Json = dataList
    .map((e: any) => (typeof e?.b64_json === 'string' ? e.b64_json : null))
    .filter((b: string | null) => !!b) as string[];

  return { urls, b64Json };
}

export async function generateArkImage(params: ArkImageGenerateParams): Promise<ArkImageGenerateResult> {
  const timeoutMs =
    typeof params.timeoutMs === 'number' && Number.isFinite(params.timeoutMs) && params.timeoutMs >= 1000
      ? Math.min(params.timeoutMs, 180000)
      : DEFAULT_TIMEOUT_MS;

  const baseUrl = String(params.baseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const responseFormat: ArkImageResponseFormat = params.responseFormat || 'url';

  const referenceImages = normalizeReferenceImagesInput(params.referenceImages);
  const imagePayload = toArkImagePayload(referenceImages);

  const requestBody: Record<string, any> = {
    model: params.model,
    prompt: params.prompt,
    response_format: responseFormat,
    sequential_image_generation: 'disabled',
    size: params.size,
    stream: false,
    watermark: !!params.watermark,
  };

  if (imagePayload) {
    requestBody.image = imagePayload;
  }

  const raw = await limitArk(() =>
    postJson(
      baseUrl,
      requestBody,
      {
        Authorization: `Bearer ${params.apiKey}`,
      },
      timeoutMs
    )
  );

  const normalized = normalizeArkResult(raw);
  return {
    urls: normalized.urls,
    b64Json: normalized.b64Json,
    raw,
  };
}

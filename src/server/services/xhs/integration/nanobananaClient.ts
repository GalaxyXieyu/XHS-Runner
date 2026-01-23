import { getSetting } from '../../../settings';

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function truncateLogBody(input: string, maxLen = 2000) {
  if (input.length <= maxLen) return input;
  return `${input.slice(0, maxLen)}…(truncated)`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postJsonWithRetry<T>(url: string, body: any, headers: Record<string, string>, options: { timeoutMs: number; retries: number }) {
  const { timeoutMs, retries } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const message = `HTTP ${response.status}: ${truncateLogBody(text)}`;
        const retryable = response.status === 429 || (response.status >= 500 && response.status <= 504);
        if (retryable && attempt < retries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
          continue;
        }
        throw new Error(message);
      }

      return await response.json();
    } catch (error: any) {
      const message = error?.name === 'AbortError' ? 'TIMEOUT' : (error?.message || String(error));
      const retryable = /TIMEOUT|AbortError|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
      if (retryable && attempt < retries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
        continue;
      }
      throw new Error(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error('Unexpected retry loop exit');
}

interface GeminiNativeResponsePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiNativeResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiNativeResponsePart[];
    };
  }>;
}

export async function generateContent(prompt: string) {
  const baseUrlRaw = await getSetting('nanobananaEndpoint');
  const apiKeyRaw = await getSetting('nanobananaApiKey');

  if (!prompt || !String(prompt).trim()) {
    throw new Error('PROMPT_REQUIRED: prompt is required');
  }

  const baseUrl = baseUrlRaw ? normalizeBaseUrl(String(baseUrlRaw)) : '';
  const apiKey = apiKeyRaw ? String(apiKeyRaw).trim() : '';

  if (!baseUrl) {
    throw new Error('GEMINI_NOT_CONFIGURED: 请先配置 Gemini Base URL');
  }

  if (!apiKey) {
    throw new Error('GEMINI_NOT_CONFIGURED: 请先配置 Gemini API Key');
  }

  const modelName = 'gemini-3-pro-image-preview';
  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: String(prompt).trim() }],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    },
  };

  const data: GeminiNativeResponse = await postJsonWithRetry(apiUrl, requestBody, { 'x-goog-api-key': apiKey }, { timeoutMs: 300000, retries: 1 });

  const parts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Gemini response invalid: candidates[0].content.parts missing');
  }

  const imagePart = parts.find(p => p?.inlineData?.data);
  const inlineData = imagePart?.inlineData;
  const imageBase64 = inlineData?.data;
  if (!imageBase64) {
    throw new Error('Gemini response invalid: inlineData.data missing');
  }

  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  return {
    text,
    imageBuffer: Buffer.from(imageBase64, 'base64'),
    metadata: { mode: 'remote', provider: 'gemini', model: modelName, mimeType: inlineData?.mimeType || 'image/png' },
  };
}

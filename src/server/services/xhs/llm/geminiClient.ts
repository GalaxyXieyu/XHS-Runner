/**
 * Gemini 多模态客户端
 * 支持图片分析和带参考图的图片生成
 */

import { db, schema } from '../../../db';
import { eq, and, desc } from 'drizzle-orm';
import { getAgentPrompt } from '../../../services/promptManager';
import type { ReferenceImageInsight } from '../referenceImageInsights';

// Gemini 图片生成串行队列（避免并发限流）
class GeminiImageLock {
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

const geminiImageLock = new GeminiImageLock();

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}

/**
 * 获取支持 Vision 的模型配置
 */
function looksLikeGeminiProvider(provider: any): boolean {
  const providerType = String(provider?.providerType || '').toLowerCase();
  const name = String(provider?.name || '').toLowerCase();
  const modelName = String(provider?.modelName || '').toLowerCase();
  const baseUrl = String(provider?.baseUrl || '').toLowerCase();

  return (
    providerType === 'gemini'
    || name.includes('gemini')
    || modelName.includes('gemini')
    || baseUrl.includes('generativelanguage')
    || baseUrl.includes('v1beta')
  );
}

async function getVisionModel() {
  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, true),
      eq(schema.llmProviders.supportsVision, true)
    ))
    .orderBy(desc(schema.llmProviders.isDefault), schema.llmProviders.id);

  if (providers.length === 0) {
    throw new Error(
      '未配置支持 Vision 的模型（llm_providers: is_enabled=true 且 supports_vision=true）。' +
      '请在设置中启用一个支持图片输入的多模态模型，并勾选 supportsVision。'
    );
  }

  const preferred = providers.find(looksLikeGeminiProvider);
  if (!preferred && providers[0]) {
    console.warn('[getVisionModel] 找到 supportsVision 模型，但未找到明显的 Gemini provider；将使用首个 provider', {
      id: providers[0].id,
      name: providers[0].name,
      providerType: providers[0].providerType,
      baseUrl: providers[0].baseUrl,
    });
  }

  return preferred || providers[0];
}

/**
 * 获取支持图片生成的模型配置
 */
async function getImageGenModel() {
  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, true),
      eq(schema.llmProviders.supportsImageGen, true)
    ))
    .orderBy(desc(schema.llmProviders.isDefault), schema.llmProviders.id);

  if (providers.length === 0) {
    throw new Error(
      '未配置支持图片生成的模型（llm_providers: is_enabled=true 且 supports_image_gen=true）。' +
      '请在设置中启用一个支持图片生成的 Gemini 模型，并勾选 supportsImageGen。'
    );
  }

  const preferred = providers.find(looksLikeGeminiProvider);
  if (!preferred && providers[0]) {
    console.warn('[getImageGenModel] 找到 supportsImageGen 模型，但未找到明显的 Gemini provider；将使用首个 provider', {
      id: providers[0].id,
      name: providers[0].name,
      providerType: providers[0].providerType,
      baseUrl: providers[0].baseUrl,
    });
  }

  return preferred || providers[0];
}

export const __testOnly = {
  getVisionModel,
  getImageGenModel,
};

/**
 * 将图片 URL 或 base64 转换为 Gemini inlineData 格式
 */
async function convertToInlineData(imageInput: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  // 如果已经是 base64 data URL
  if (imageInput.startsWith('data:')) {
    const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { inlineData: { mimeType: match[1], data: match[2] } };
    }
  }

  // 如果是 URL，需要下载并转换
  if (imageInput.startsWith('http')) {
    const response = await fetch(imageInput);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return { inlineData: { mimeType: contentType, data: base64 } };
  }

  // 假设是纯 base64
  return { inlineData: { mimeType: 'image/jpeg', data: imageInput } };
}

/**
 * 分析参考图风格 (使用 Gemini 原生 API)
 */
export async function analyzeReferenceImage(imageUrl: string, opts?: { allowMissingVisionModel?: boolean }): Promise<{
  style: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  lighting: string;
  texture: string;
  layout?: string;
  textDensity?: string;
  elementaryComponents?: string[];
  description: string;
}> {
  // When callers already provide explicit reference buckets (style/content/layout),
  // avoid blocking the workflow if no Vision-capable provider is configured.
  let model: any;
  try {
    model = await getVisionModel();
  } catch (err) {
    if (opts?.allowMissingVisionModel) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        style: 'unknown',
        colorPalette: [],
        mood: '',
        composition: '',
        lighting: '',
        texture: '',
        layout: '',
        textDensity: '',
        elementaryComponents: [],
        description: `Vision analysis skipped: ${message}`,
      };
    }
    throw err;
  }

  // yunwu.ai 的 Gemini 原生 API 不需要 /v1 后缀
  const baseUrl = (model.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
  // 使用 nothinking 模型，避免输出思考过程
  const modelName = 'gemini-2.5-flash-lite-nothinking';

  const imageData = await convertToInlineData(imageUrl);

  // 使用 Gemini 原生格式
  const requestBody = {
    contents: [
      // Few-shot 示例 1 (包含新字段，保持简短)
      {
        role: "user",
        parts: [{ text: "Analyze this image style and return JSON only." }]
      },
      {
        role: "model",
        parts: [{ text: `{"style":"minimalist","colorPalette":["White","Black","Gold"],"mood":"elegant","composition":"centered","lighting":"soft","texture":"smooth","layout":"single centered","textDensity":"low","elementaryComponents":["product closeup","text overlay"],"description":"Clean modern design"}` }]
      },
      // Few-shot 示例 2
      {
        role: "user",
        parts: [{ text: "Analyze this image style and return JSON only." }]
      },
      {
        role: "model",
        parts: [{ text: `{"style":"3D illustration","colorPalette":["Cream","Coral","Teal"],"mood":"playful","composition":"isometric","lighting":"ambient","texture":"matte","layout":"collage","textDensity":"medium","elementaryComponents":["stickers","handwritten notes"],"description":"Cute 3D miniature scene"}` }]
      },
      // 实际请求 - 使用硬编码 Prompt 确保 JSON 格式
      {
        role: "user",
        parts: [
          { text: "Analyze this image. Return ONLY a JSON object with these exact keys: style, colorPalette (array), mood, composition, lighting, texture, layout, textDensity, elementaryComponents (array), description. NO explanation, NO markdown, JUST JSON." },
          imageData
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 256,
    }
  };

  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': model.apiKey || '',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API 请求失败: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();

  const textContent = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;

  if (!textContent) {
    throw new Error('Gemini Vision API 未返回分析结果');
  }

  // 提取 JSON - 尝试多种方式
  let jsonStr: string | null = null;

  // 方式1: 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 方式2: 直接匹配 JSON 对象
  if (!jsonStr) {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  if (!jsonStr) {
    console.error('[analyzeReferenceImage] Cannot extract JSON from:', textContent);
    throw new Error('无法解析风格分析结果');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('[analyzeReferenceImage] JSON parse error:', e, 'jsonStr:', jsonStr.slice(0, 200));
    throw new Error('无法解析风格分析结果');
  }
}

export async function analyzeReferenceImages(referenceImageUrls: string[]): Promise<ReferenceImageInsight[]> {
  const results: ReferenceImageInsight[] = [];

  for (const url of referenceImageUrls) {
    results.push(await analyzeSingleReferenceImageInsight(url));
  }

  return results;
}

function extractJsonObject(textContent: string, context: string): any {
  let jsonStr: string | null = null;

  const codeBlockMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  if (!jsonStr) {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  if (!jsonStr) {
    console.error(`[${context}] Cannot extract JSON from:`, textContent);
    throw new Error('无法解析参考图分析结果');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[${context}] JSON parse error:`, e, 'jsonStr:', jsonStr.slice(0, 200));
    throw new Error('无法解析参考图分析结果');
  }
}

function normalizeReferenceImageInsight(raw: any): ReferenceImageInsight {
  const allowedTypes = new Set(['screenshot', 'logo', 'photo', 'illustration', 'unknown']);
  const allowedBuckets = new Set(['style', 'content', 'both']);

  const type = allowedTypes.has(String(raw?.type)) ? String(raw.type) : 'unknown';
  const bucket = allowedBuckets.has(String(raw?.bucket)) ? String(raw.bucket) : 'both';

  const confidenceRaw = Number(raw?.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.6;

  const styleTags = Array.isArray(raw?.style_tags) ? raw.style_tags.map((v: any) => String(v)) : [];
  const contentTags = Array.isArray(raw?.content_tags) ? raw.content_tags.map((v: any) => String(v)) : [];
  const layoutHints = Array.isArray(raw?.layout_hints) ? raw.layout_hints.map((v: any) => String(v)) : [];

  return {
    type: type as ReferenceImageInsight['type'],
    bucket: bucket as ReferenceImageInsight['bucket'],
    confidence,
    style_tags: styleTags,
    content_tags: contentTags,
    layout_hints: layoutHints,
  };
}

async function analyzeSingleReferenceImageInsight(imageUrl: string): Promise<ReferenceImageInsight> {
  const model = await getVisionModel();
  const baseUrl = (model.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
  const modelName = 'gemini-2.5-flash-lite-nothinking';

  const imageData = await convertToInlineData(imageUrl);

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Classify this reference image for generative cover design. Return JSON only.' }],
      },
      {
        role: 'model',
        parts: [{
          text: '{"type":"screenshot","style_tags":["palette: cool gray + blue","lighting: flat/neutral","composition: centered device"],"content_tags":["phone mockup","app UI screen"],"layout_hints":["leave top area for title","keep UI readable"],"confidence":0.86,"bucket":"content"}'
        }],
      },
      {
        role: 'user',
        parts: [{ text: 'Classify this reference image for generative cover design. Return JSON only.' }],
      },
      {
        role: 'model',
        parts: [{
          text: '{"type":"illustration","style_tags":["palette: warm beige + sage","mood: calm","lighting: soft","materials: matte","composition: large whitespace"],"content_tags":[],"layout_hints":["minimal text zone"],"confidence":0.78,"bucket":"style"}'
        }],
      },
      {
        role: 'user',
        parts: [
          {
            text: [
              'Analyze this image and return ONLY one JSON object with these exact keys:',
              'type (screenshot|logo|photo|illustration|unknown),',
              'style_tags (array of short actionable tags; include palette/lighting/mood/composition/materials/lens when possible),',
              'content_tags (array; include logo/UI/product intent or elements that must appear),',
              'layout_hints (array; placement, reserved zones, grids, safe margins),',
              'confidence (0..1),',
              'bucket (style|content|both).',
              'No markdown. No explanation. JSON only.'
            ].join(' '),
          },
          imageData,
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 512,
    },
  };

  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': model.apiKey || '',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API 请求失败: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;

  if (!textContent) {
    throw new Error('Gemini Vision API 未返回分析结果');
  }

  const raw = extractJsonObject(textContent, 'analyzeReferenceImages');
  return normalizeReferenceImageInsight(raw);
}

/**
 * 带参考图生成图片（带重试逻辑 + 串行队列，支持多张参考图）
 */
export async function generateImageWithReference(params: {
  prompt: string;
  referenceImageUrls: string[]; // 支持多张参考图
  aspectRatio?: string;
}): Promise<{
  imageBase64: string;
  mimeType: string;
}> {
  // 使用队列串行执行，避免并发限流
  return geminiImageLock.enqueue(async () => {
    const model = await getImageGenModel();
    const baseUrl = (model.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
    const modelName = model.modelName || 'gemini-2.0-flash-exp-image-generation';

    // 转换所有参考图为 inlineData 格式
    const referenceDataList = await Promise.all(
      params.referenceImageUrls.map(url => convertToInlineData(url))
    );

    // 构建请求体，支持多张参考图
    const requestBody = {
      contents: [{
        parts: [
          { text: params.prompt },
          ...referenceDataList // 展开所有参考图到 parts 数组
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: params.aspectRatio || "3:4"
        }
      }
    };

    const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;

    // 重试逻辑：最多重试 3 次
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 重试前等待（避免限流）
        if (attempt > 1) {
          const delay = 3000 * attempt;
          await new Promise(r => setTimeout(r, delay));
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': model.apiKey || '',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(300000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          // 429 限流时重试
          if (response.status === 429 && attempt < maxRetries) {
            lastError = new Error(`Rate limited: ${response.status}`);
            continue;
          }
          throw new Error(`Gemini 图片生成失败: ${response.status} - ${errorText}`);
        }

        const data: GeminiResponse = await response.json();
        const responseStr = JSON.stringify(data).slice(0, 500);

        const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart?.inlineData) {
          return {
            imageBase64: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType,
          };
        }

        // 检查是否只有 thoughtSignature（模型在思考但没生成图片）
        const hasThoughtSignature = responseStr.includes('thoughtSignature');
        if (hasThoughtSignature && attempt < maxRetries) {
          lastError = new Error('模型返回思考过程但未生成图片');
          continue;
        }

        // 尝试从文本中提取 URL
        const textPart = data.candidates?.[0]?.content?.parts?.find(p => p.text);
        if (textPart?.text) {
          const urlMatch = textPart.text.match(/(https?:\/\/[^\s\)]+\.(?:png|jpg|jpeg|gif|webp))/i);
          if (urlMatch) {
            const imgResponse = await fetch(urlMatch[1]);
            const buffer = await imgResponse.arrayBuffer();
            return {
              imageBase64: Buffer.from(buffer).toString('base64'),
              mimeType: imgResponse.headers.get('content-type') || 'image/png',
            };
          }
        }

        lastError = new Error('Gemini 未返回图片数据');
        if (attempt < maxRetries) {
          continue;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          continue;
        }
      }
    }

    throw lastError || new Error('Gemini 图片生成失败');
  });
}

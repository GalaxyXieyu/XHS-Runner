/**
 * Gemini 多模态客户端
 * 支持图片分析和带参考图的图片生成
 */

import { db, schema } from '../../../db';
import { eq, and } from 'drizzle-orm';

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
async function getVisionModel() {
  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, 1 as unknown as boolean),
      eq(schema.llmProviders.supportsVision, true)
    ));

  if (providers.length === 0) {
    throw new Error('未配置支持 Vision 的模型，请在设置中添加 Gemini 或 GPT-4o 等多模态模型。');
  }

  return providers[0];
}

/**
 * 获取支持图片生成的模型配置
 */
async function getImageGenModel() {
  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, 1 as unknown as boolean),
      eq(schema.llmProviders.supportsImageGen, true)
    ));

  if (providers.length === 0) {
    throw new Error('未配置支持图片生成的模型，请在设置中添加 Gemini 等支持图片生成的模型。');
  }

  return providers[0];
}

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
export async function analyzeReferenceImage(imageUrl: string): Promise<{
  style: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  lighting: string;
  texture: string;
  description: string;
}> {
  const model = await getVisionModel();
  // yunwu.ai 的 Gemini 原生 API 不需要 /v1 后缀
  const baseUrl = (model.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
  // 使用 nothinking 模型，避免输出思考过程
  const modelName = 'gemini-2.5-flash-lite-nothinking';

  const imageData = await convertToInlineData(imageUrl);

  // 使用 Gemini 原生格式
  const requestBody = {
    contents: [
      // Few-shot 示例 1
      {
        role: "user",
        parts: [{ text: "Analyze this image style and return JSON only." }]
      },
      {
        role: "model",
        parts: [{ text: `{"style":"minimalist","colorPalette":["White","Black","Gold"],"mood":"elegant","composition":"centered","lighting":"soft","texture":"smooth","description":"Clean modern design with luxury accents"}` }]
      },
      // Few-shot 示例 2
      {
        role: "user",
        parts: [{ text: "Analyze this image style and return JSON only." }]
      },
      {
        role: "model",
        parts: [{ text: `{"style":"3D illustration","colorPalette":["Cream","Coral","Teal"],"mood":"playful","composition":"isometric","lighting":"ambient","texture":"matte","description":"Cute 3D miniature scene with soft colors"}` }]
      },
      // 实际请求
      {
        role: "user",
        parts: [
          { text: "Analyze this image style and return JSON only." },
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

/**
 * 带参考图生成图片（带重试逻辑 + 串行队列）
 */
export async function generateImageWithReference(params: {
  prompt: string;
  referenceImageUrl: string;
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

    const referenceData = await convertToInlineData(params.referenceImageUrl);

    const requestBody = {
      contents: [{
        parts: [
          { text: params.prompt },
          referenceData
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

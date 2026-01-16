/**
 * Gemini 多模态客户端
 * 支持图片分析和带参考图的图片生成
 */

import { db, schema } from '../../../db';
import { eq, and } from 'drizzle-orm';
import { Jimp } from 'jimp';

// 图片压缩配置
const MAX_IMAGE_SIZE = 150 * 1024; // 150KB
const TARGET_WIDTH = 800; // 目标宽度

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
 * 压缩图片到目标大小
 */
async function compressImage(base64Data: string, mimeType: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const originalSize = buffer.length;

    // 如果已经小于目标大小，直接返回
    if (originalSize <= MAX_IMAGE_SIZE) {
      console.log(`[compressImage] Image already small: ${Math.round(originalSize / 1024)}KB`);
      return base64Data;
    }

    const image = await Jimp.read(buffer);

    // 缩小尺寸 (jimp v1.x API)
    if (image.width > TARGET_WIDTH) {
      image.resize({ w: TARGET_WIDTH });
    }

    // jimp v1.x: 直接获取 JPEG buffer
    const compressedBuffer = await image.getBuffer("image/jpeg");

    // 如果压缩后反而变大，返回原图
    if (compressedBuffer.length >= originalSize) {
      console.log(`[compressImage] Compression ineffective: ${Math.round(originalSize / 1024)}KB -> ${Math.round(compressedBuffer.length / 1024)}KB, using original`);
      return base64Data;
    }

    const compressedBase64 = compressedBuffer.toString('base64');
    console.log(`[compressImage] Compressed: ${Math.round(originalSize / 1024)}KB -> ${Math.round(compressedBuffer.length / 1024)}KB`);
    return compressedBase64;
  } catch (e) {
    console.error('[compressImage] Error:', e);
    return base64Data; // 压缩失败时返回原图
  }
}

/**
 * 将图片 URL 或 base64 转换为 Gemini inlineData 格式
 */
async function convertToInlineData(imageInput: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  // 如果已经是 base64 data URL
  if (imageInput.startsWith('data:')) {
    const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const compressed = await compressImage(match[2], match[1]);
      return { inlineData: { mimeType: 'image/jpeg', data: compressed } };
    }
  }

  // 如果是 URL，需要下载并转换
  if (imageInput.startsWith('http')) {
    const response = await fetch(imageInput);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const compressed = await compressImage(base64, 'image/jpeg');
    return { inlineData: { mimeType: 'image/jpeg', data: compressed } };
  }

  // 假设是纯 base64
  const compressed = await compressImage(imageInput, 'image/jpeg');
  return { inlineData: { mimeType: 'image/jpeg', data: compressed } };
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
  console.log('[analyzeReferenceImage] API URL:', apiUrl);
  console.log('[analyzeReferenceImage] Model:', modelName);
  console.log('[analyzeReferenceImage] Image data size:', imageData.inlineData.data.length);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': model.apiKey || '',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('[analyzeReferenceImage] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API 请求失败: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  console.log('[analyzeReferenceImage] Response data:', JSON.stringify(data).slice(0, 500));

  const textContent = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;

  if (!textContent) {
    throw new Error('Gemini Vision API 未返回分析结果');
  }

  console.log('[analyzeReferenceImage] Raw text:', textContent.slice(0, 300));

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
 * 带参考图生成图片
 */
export async function generateImageWithReference(params: {
  prompt: string;
  referenceImageUrl: string;
  aspectRatio?: string;
}): Promise<{
  imageBase64: string;
  mimeType: string;
}> {
  const model = await getImageGenModel();
  // yunwu.ai 直接使用，不带 /v1 后缀
  const baseUrl = (model.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
  const modelName = 'gemini-3-pro-image-preview'; // 与参考实现一致

  const referenceData = await convertToInlineData(params.referenceImageUrl);

  // 使用与参考实现一致的请求格式
  const requestBody = {
    contents: [{
      parts: [
        { text: params.prompt },
        referenceData
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: params.aspectRatio || "3:4"  // 小红书竖版
      }
    }
  };

  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;
  console.log('[generateImageWithReference] API URL:', apiUrl);
  console.log('[generateImageWithReference] Model:', modelName);
  console.log('[generateImageWithReference] Prompt:', params.prompt.slice(0, 100) + '...');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': model.apiKey || '',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(300000), // 5分钟超时
  });

  console.log('[generateImageWithReference] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[generateImageWithReference] Error:', errorText);
    throw new Error(`Gemini 图片生成失败: ${response.status} - ${errorText}`);
  }

  const data: GeminiResponse = await response.json();
  console.log('[generateImageWithReference] Response:', JSON.stringify(data).slice(0, 500));

  const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

  if (!imagePart?.inlineData) {
    // 尝试从文本中提取 URL
    const textPart = data.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (textPart?.text) {
      const urlMatch = textPart.text.match(/(https?:\/\/[^\s\)]+\.(?:png|jpg|jpeg|gif|webp))/i);
      if (urlMatch) {
        // 下载图片并转换为 base64
        const imgResponse = await fetch(urlMatch[1]);
        const buffer = await imgResponse.arrayBuffer();
        return {
          imageBase64: Buffer.from(buffer).toString('base64'),
          mimeType: imgResponse.headers.get('content-type') || 'image/png',
        };
      }
    }
    throw new Error('Gemini 未返回图片数据');
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

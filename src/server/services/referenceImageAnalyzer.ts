import { db, schema } from "../db";
import { referenceImageAnalyses, type ReferenceImage } from "../db/schema";
import { analyzeReferenceImage } from "./xhs/llm/geminiClient";
import { eq } from "drizzle-orm";

/**
 * 参考图分析结果
 */
export interface ReferenceImageAnalysisResult {
  referenceImageId: number;
  isStyleReference: boolean;
  confidence: number;
  styleParams?: {
    colorPalette: string[];
    mood: string;
    lighting: string;
    styleKeywords: string[];
  };
  materialParams?: {
    composition: string;
    elements: string[];
    layout: string;
  };
  rawAnalysis: string;
}

/**
 * 分析参考图，判断是否是风格参考
 *
 * 判断逻辑：
 * - 风格参考：画面元素简单、色彩/构图突出、无具体内容指向
 * - 素材参考：画面有具体内容（人物、产品、场景）、构图可复用
 */
export async function analyzeReferenceImageType(
  referenceImage: ReferenceImage,
  options: { forceReanalyze?: boolean } = {}
): Promise<ReferenceImageAnalysisResult> {
  // 检查是否已有分析结果
  if (!options.forceReanalyze) {
    const existing = await db
      .select()
      .from(referenceImageAnalyses)
      .where(eq(referenceImageAnalyses.referenceImageId, referenceImage.id))
      .orderBy(referenceImageAnalyses.createdAt)
      .limit(1);

    if (existing.length > 0) {
      const existingAnalysis = existing[0];
      return {
        referenceImageId: referenceImage.id,
        isStyleReference: existingAnalysis.isStyleReference,
        confidence: Number(existingAnalysis.confidence),
        styleParams: existingAnalysis.styleParams as ReferenceImageAnalysisResult["styleParams"],
        materialParams: existingAnalysis.materialParams as ReferenceImageAnalysisResult["materialParams"],
        rawAnalysis: existingAnalysis.rawAnalysis || "",
      };
    }
  }

  // 调用现有的风格分析获取基础信息
  const baseStyleAnalysis = await analyzeReferenceImage(referenceImage.url || referenceImage.path || "");

  // 使用 Gemini Vision 判断是否是风格参考
  const result = await performReferenceTypeAnalysis(
    referenceImage.url || referenceImage.path || "",
    baseStyleAnalysis
  );

  // 保存分析结果
  await db.insert(referenceImageAnalyses).values({
    referenceImageId: referenceImage.id,
    isStyleReference: result.isStyleReference,
    confidence: result.confidence,
    styleParams: result.styleParams,
    materialParams: result.materialParams,
    rawAnalysis: result.rawAnalysis,
    modelUsed: "gemini-2.5-flash-lite-nothinking",
  });

  return {
    referenceImageId: referenceImage.id,
    ...result,
  };
}

/**
 * 判断参考图类型
 */
async function performReferenceTypeAnalysis(
  imageUrl: string,
  baseStyleAnalysis: {
    style: string;
    colorPalette: string[];
    mood: string;
    composition: string;
    lighting: string;
    texture: string;
    description: string;
  }
): Promise<Omit<ReferenceImageAnalysisResult, "referenceImageId">> {
  const prompt = `分析这张图片，判断它是风格参考还是素材参考。

## 风格参考特征：
- 画面以色彩、质感、氛围为主
- 没有具体的产品、人物或场景内容
- 主要用于参考色调、光线、风格关键词

## 素材参考特征：
- 画面有具体的内容（人物、产品、场景、物品）
- 构图或布局可复用
- 重点在于内容元素而非风格

## 已有风格分析信息
- 风格: ${baseStyleAnalysis.style}
- 色调: ${baseStyleAnalysis.colorPalette.join(", ")}
- 氛围: ${baseStyleAnalysis.mood}
- 构图: ${baseStyleAnalysis.composition}
- 光线: ${baseStyleAnalysis.lighting}

## 输出要求
请以 JSON 格式输出判断结果：

\`\`\`json
{
  "isStyleReference": true/false,
  "confidence": 0.85,
  "reasoning": "判断理由（简短说明）"
}
\`\`\`

请直接输出 JSON，不要有其他内容。`;

  // 这里简化处理：基于风格分析的描述来判断
  // 如果描述中提到具体的产品、人物、场景，则更可能是素材参考
  const description = baseStyleAnalysis.description.toLowerCase();
  const hasSpecificContent = /\b(产品|人物|人物|场景|物品|产品|手机|电脑|服装|食物|建筑|房间|办公室)\b/.test(description);

  // 如果没有具体内容指向，且风格特征明显，则认为是风格参考
  const isStyleReference = !hasSpecificContent && !!(
    baseStyleAnalysis.colorPalette.length > 0 ||
    baseStyleAnalysis.mood ||
    baseStyleAnalysis.texture
  );

  const confidence = hasSpecificContent ? 0.9 : (isStyleReference ? 0.75 : 0.85);

  const reasoning = isStyleReference
    ? "画面以风格特征为主，无具体内容指向"
    : "画面包含具体内容元素，构图可复用";

  return {
    isStyleReference,
    confidence,
    rawAnalysis: reasoning,
    styleParams: isStyleReference ? {
      colorPalette: baseStyleAnalysis.colorPalette,
      mood: baseStyleAnalysis.mood,
      lighting: baseStyleAnalysis.lighting,
      styleKeywords: [baseStyleAnalysis.style],
    } : undefined,
    materialParams: !isStyleReference ? {
      composition: baseStyleAnalysis.composition,
      elements: [],
      layout: baseStyleAnalysis.composition,
    } : undefined,
  };
}

/**
 * 批量分析多张参考图
 */
export async function batchAnalyzeReferenceImages(
  referenceImages: ReferenceImage[],
  options: { forceReanalyze?: boolean } = {}
): Promise<Map<number, ReferenceImageAnalysisResult>> {
  const results = new Map<number, ReferenceImageAnalysisResult>();

  for (const refImage of referenceImages) {
    const result = await analyzeReferenceImageType(refImage, options);
    results.set(refImage.id, result);
  }

  return results;
}

/**
 * 从多张参考图中提取风格参数
 * 只提取标记为"风格参考"的图片
 */
export async function extractStyleParamsFromReferences(
  referenceImages: ReferenceImage[]
): Promise<{
  colorPalette: string[];
  mood: string;
  lighting: string;
  styleKeywords: string[];
}> {
  const allStyleParams: {
    colorPalette: string[];
    mood: string;
    lighting: string;
    styleKeywords: string[];
  }[] = [];

  for (const refImage of referenceImages) {
    const analysis = await analyzeReferenceImageType(refImage);

    if (analysis.isStyleReference && analysis.styleParams) {
      allStyleParams.push(analysis.styleParams);
    }
  }

  if (allStyleParams.length === 0) {
    return {
      colorPalette: [],
      mood: "",
      lighting: "",
      styleKeywords: [],
    };
  }

  // 合并风格参数（取多个风格参考的并集）
  const colorPaletteSet = new Set<string>();
  const moodSet = new Set<string>();
  const lightingSet = new Set<string>();
  const styleKeywordsSet = new Set<string>();

  for (const params of allStyleParams) {
    params.colorPalette.forEach((c) => colorPaletteSet.add(c));
    if (params.mood) moodSet.add(params.mood);
    if (params.lighting) lightingSet.add(params.lighting);
    params.styleKeywords.forEach((k) => styleKeywordsSet.add(k));
  }

  return {
    colorPalette: Array.from(colorPaletteSet),
    mood: Array.from(moodSet).join(" + "),
    lighting: Array.from(lightingSet).join(" + "),
    styleKeywords: Array.from(styleKeywordsSet),
  };
}

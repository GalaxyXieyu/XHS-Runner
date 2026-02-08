/**
 * Intent Agent - 识别用户意图并推荐模板
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// 意图类型
export type IntentType =
  | "create_content"      // 创作内容
  | "analyze_style"       // 分析风格
  | "generate_images"     // 生成图片
  | "research_trends"     // 研究趋势
  | "optimize_content";   // 优化内容

// 意图识别结果
export interface IntentResult {
  intent: IntentType;
  confidence: number;
  suggestedCategory?: "image_style" | "writing_tone" | "content_structure";
  keywords: string[];
}

// 意图关键词映射
const intentKeywords: Record<IntentType, string[]> = {
  create_content: ["写", "创作", "生成文案", "标题", "正文", "内容"],
  analyze_style: ["分析", "风格", "参考", "学习", "模仿"],
  generate_images: ["图片", "封面", "配图", "生成图", "图像"],
  research_trends: ["趋势", "热门", "爆款", "流行", "数据"],
  optimize_content: ["优化", "改进", "修改", "调整", "提升"],
};

// 意图到模板分类映射
const intentToCategory: Record<IntentType, "image_style" | "writing_tone" | "content_structure" | undefined> = {
  create_content: "writing_tone",
  analyze_style: "image_style",
  generate_images: "image_style",
  research_trends: undefined,
  optimize_content: "content_structure",
};

/**
 * 识别用户意图
 */
export function detectIntent(message: string): IntentResult {
  const scores: Record<IntentType, number> = {
    create_content: 0,
    analyze_style: 0,
    generate_images: 0,
    research_trends: 0,
    optimize_content: 0,
  };

  const foundKeywords: string[] = [];

  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        scores[intent as IntentType] += 1;
        foundKeywords.push(keyword);
      }
    }
  }

  // 找出最高分的意图
  let maxIntent: IntentType = "create_content";
  let maxScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent as IntentType;
    }
  }

  const totalKeywords = Object.values(intentKeywords).flat().length;
  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1) : 0.3;

  return {
    intent: maxIntent,
    confidence,
    suggestedCategory: intentToCategory[maxIntent],
    keywords: [...new Set(foundKeywords)],
  };
}

/**
 * 推荐模板工具
 */
export const recommendTemplatesTool = tool(
  async ({ message, category, limit }) => {
    const intent = detectIntent(message);

    // 构建查询条件
    const conditions = [eq(schema.promptProfiles.isTemplate, true)];
    const targetCategory = category || intent.suggestedCategory;
    if (targetCategory) {
      conditions.push(eq(schema.promptProfiles.category, targetCategory));
    }

    // 查询模板，按使用次数排序
    const templates = await db
      .select({
        id: schema.promptProfiles.id,
        name: schema.promptProfiles.name,
        category: schema.promptProfiles.category,
        tags: schema.promptProfiles.tags,
        usageCount: schema.promptProfiles.usageCount,
      })
      .from(schema.promptProfiles)
      .where(and(...conditions))
      .orderBy(desc(schema.promptProfiles.usageCount))
      .limit(limit);

    return {
      intent: intent.intent,
      confidence: intent.confidence,
      suggestedCategory: targetCategory,
      keywords: intent.keywords,
      templates,
    };
  },
  {
    name: "recommendTemplates",
    description: "根据用户输入识别意图并推荐相关模板",
    schema: z.object({
      message: z.string().describe("用户输入的消息"),
      category: z
        .enum(["image_style", "writing_tone", "content_structure"])
        .nullable()
        .optional()
        .describe("指定模板分类（可选）"),
      limit: z.number().default(5).describe("返回模板数量"),
    }),
  }
);

// 导出工具
export const intentTools = [recommendTemplatesTool];

/**
 * 模板推荐 API - 根据用户输入推荐模板
 */
import { NextApiRequest, NextApiResponse } from "next";
import { detectIntent } from "@/server/agents/tools/intentTools";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, limit = 5 } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message required" });
    }

    // 识别意图
    const intent = detectIntent(message);

    // 查询推荐模板
    const conditions = [eq(schema.promptProfiles.isTemplate, true)];
    if (intent.suggestedCategory) {
      conditions.push(eq(schema.promptProfiles.category, intent.suggestedCategory));
    }

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

    return res.status(200).json({
      intent: intent.intent,
      confidence: intent.confidence,
      suggestedCategory: intent.suggestedCategory,
      keywords: intent.keywords,
      templates,
    });
  } catch (error) {
    console.error("[/api/templates/recommend] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

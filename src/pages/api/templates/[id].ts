/**
 * 单个模板详情 API
 * GET: 获取模板详情
 * POST: 应用模板（增加使用次数）
 */
import { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id required" });
  }

  const templateId = parseInt(id);

  try {
    switch (req.method) {
      case "GET": {
        const [template] = await db
          .select()
          .from(schema.promptProfiles)
          .where(eq(schema.promptProfiles.id, templateId))
          .limit(1);

        if (!template) {
          return res.status(404).json({ error: "Template not found" });
        }

        return res.status(200).json({ template });
      }

      case "POST": {
        // 应用模板 - 增加使用次数
        const [template] = await db
          .select()
          .from(schema.promptProfiles)
          .where(eq(schema.promptProfiles.id, templateId))
          .limit(1);

        if (!template) {
          return res.status(404).json({ error: "Template not found" });
        }

        await db
          .update(schema.promptProfiles)
          .set({ usageCount: sql`${schema.promptProfiles.usageCount} + 1` })
          .where(eq(schema.promptProfiles.id, templateId));

        return res.status(200).json({
          success: true,
          prompt: template.systemPrompt,
          category: template.category,
        });
      }

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("[/api/templates/[id]] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

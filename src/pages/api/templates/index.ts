/**
 * 模板管理 API
 * GET: 列出/搜索模板
 * POST: 创建模板
 * PUT: 更新模板
 * DELETE: 删除模板
 */
import { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case "GET": {
        const { category, query, limit = "20" } = req.query;
        const conditions = [eq(schema.promptProfiles.isTemplate, true)];

        if (category && typeof category === "string") {
          conditions.push(eq(schema.promptProfiles.category, category));
        }
        if (query && typeof query === "string") {
          conditions.push(ilike(schema.promptProfiles.name, `%${query}%`));
        }

        const templates = await db
          .select({
            id: schema.promptProfiles.id,
            name: schema.promptProfiles.name,
            category: schema.promptProfiles.category,
            tags: schema.promptProfiles.tags,
            usageCount: schema.promptProfiles.usageCount,
            createdAt: schema.promptProfiles.createdAt,
          })
          .from(schema.promptProfiles)
          .where(and(...conditions))
          .orderBy(desc(schema.promptProfiles.usageCount))
          .limit(parseInt(limit as string));

        return res.status(200).json({ templates });
      }

      case "POST": {
        const { name, category, systemPrompt, tags } = req.body;
        if (!name || !category || !systemPrompt) {
          return res.status(400).json({ error: "name, category, systemPrompt required" });
        }

        const [result] = await db
          .insert(schema.promptProfiles)
          .values({
            name,
            category,
            systemPrompt,
            userTemplate: "",
            isTemplate: true,
            tags: tags || [],
          })
          .returning({ id: schema.promptProfiles.id });

        return res.status(201).json({ id: result.id });
      }

      case "PUT": {
        const { id, name, category, systemPrompt, tags } = req.body;
        if (!id) {
          return res.status(400).json({ error: "id required" });
        }

        const updates: Record<string, any> = {};
        if (name) updates.name = name;
        if (category) updates.category = category;
        if (systemPrompt) updates.systemPrompt = systemPrompt;
        if (tags) updates.tags = tags;

        await db
          .update(schema.promptProfiles)
          .set(updates)
          .where(eq(schema.promptProfiles.id, id));

        return res.status(200).json({ success: true });
      }

      case "DELETE": {
        const { id } = req.query;
        if (!id) {
          return res.status(400).json({ error: "id required" });
        }

        await db
          .delete(schema.promptProfiles)
          .where(eq(schema.promptProfiles.id, parseInt(id as string)));

        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("[/api/templates] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

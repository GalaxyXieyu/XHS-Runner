/**
 * Prompt 管理工具 - 统一的模板管理接口
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, and, ilike, desc, sql, asc } from "drizzle-orm";

// 避免 tool 泛型在 TS5 上触发深度实例化（TS2589）导致编译极慢/卡死
const createTool = tool as any;

// 计算成功率的 SQL 表达式
const successRateExpr = sql`(COALESCE(${schema.promptProfiles.successCount}, 0)::float / NULLIF(${schema.promptProfiles.successCount} + ${schema.promptProfiles.failCount}, 0))`;

// ========== Prompt 优化辅助函数 ==========

/**
 * 根据审核反馈生成优化后的 prompt
 * 这是一个简单的基于规则的优化，实际生产中可以使用 LLM
 */
function generateOptimizedPrompt(
  agentName: string | undefined,
  prompt: string | undefined,
  feedback: string | undefined
): string {
  if (!prompt) return "";

  let optimized = prompt;
  const feedbackLower = (feedback || "").toLowerCase();
  const suggestions: string[] = [];

  // 根据 feedback 关键词添加优化建议
  if (feedbackLower.includes("太短") || feedbackLower.includes("不够详细")) {
    suggestions.push("请提供更详细的内容，增加具体描述和细节。");
  }
  if (feedbackLower.includes("太长") || feedbackLower.includes("太冗长")) {
    suggestions.push("请精简内容，去除冗余表达，保持简洁有力。");
  }
  if (feedbackLower.includes("风格") || feedbackLower.includes("不符")) {
    suggestions.push("请调整风格，使其更符合目标受众的喜好。");
  }
  if (feedbackLower.includes("标题") || feedbackLower.includes("吸引力")) {
    suggestions.push("请优化标题，使用更有吸引力的表达方式，增加点击欲。");
  }
  if (feedbackLower.includes("标签")) {
    suggestions.push("请选择更热门、相关性更高的标签组合。");
  }
  if (feedbackLower.includes("图片") || feedbackLower.includes("图像")) {
    suggestions.push("请优化图片描述，使生成的图片更加精准和美观。");
  }
  if (feedbackLower.includes("颜色") || feedbackLower.includes("色调")) {
    suggestions.push("请调整颜色搭配，使用更和谐的色调。");
  }
  if (feedbackLower.includes("构图") || feedbackLower.includes("布局")) {
    suggestions.push("请优化构图和布局，使其更加合理美观。");
  }

  // 根据 agent 类型添加特定优化
  if (agentName === "writer_agent") {
    suggestions.push("文案应更接地气，符合小红书用户的阅读习惯。");
  } else if (agentName === "image_planner_agent") {
    suggestions.push("图片规划应更加清晰，每个图片的描述要具体明确。");
  } else if (agentName === "image_agent") {
    suggestions.push("生成的图片应更符合小红书风格，注重视觉效果。");
  } else if (agentName === "research_evidence_agent") {
    suggestions.push("研究结论需可验证，优先输出可直接写入正文的事实证据。");
  }

  // 将优化建议附加到 prompt 末尾
  if (suggestions.length > 0) {
    const optimizationSection = `\n\n【优化指导】基于上次审核反馈，请注意：\n${suggestions.map((s) => `- ${s}`).join("\n")}`;
    optimized += optimizationSection;
  }

  return optimized;
}

export const managePromptTool = createTool(
  async ({
    action,
    agentName,
    prompt,
    feedback,
    templateId,
    templateName,
    category,
    tags,
    query,
    success,
  }) => {
    switch (action) {
      case "modify":
        // 修改当前 agent 的 prompt (返回给调用者处理)
        return { success: true, agentName, newPrompt: prompt };

      case "optimize":
        // 根据审核反馈优化 prompt
        const optimizedPrompt = generateOptimizedPrompt(agentName, prompt, feedback);
        return {
          success: true,
          agentName,
          originalPrompt: prompt,
          optimizedPrompt,
          feedback: feedback,
        };

      case "save":
        // 保存为模板
        const [result] = await db
          .insert(schema.promptProfiles)
          .values({
            name: templateName!,
            category: category!,
            systemPrompt: prompt!,
            userTemplate: "",
            isTemplate: true,
            tags: tags || [],
          })
          .returning({ id: schema.promptProfiles.id });
        return { success: true, templateId: result.id };

      case "search":
        // 搜索模板 - 按成功率排序（而非 usageCount）
        const conditions = [eq(schema.promptProfiles.isTemplate, true)];
        if (query) {
          conditions.push(ilike(schema.promptProfiles.name, `%${query}%`));
        }
        if (category) {
          conditions.push(eq(schema.promptProfiles.category, category));
        }
        const templates = await db
          .select({
            id: schema.promptProfiles.id,
            name: schema.promptProfiles.name,
            category: schema.promptProfiles.category,
            tags: schema.promptProfiles.tags,
            usageCount: schema.promptProfiles.usageCount,
            successCount: schema.promptProfiles.successCount,
            failCount: schema.promptProfiles.failCount,
            successRate: successRateExpr.as("success_rate"),
          })
          .from(schema.promptProfiles)
          .where(and(...conditions))
          // 按成功率降序，使用次数降序作为次要排序
          .orderBy(desc(successRateExpr), desc(schema.promptProfiles.usageCount))
          .limit(20);
        return { templates };

      case "apply":
        // 应用模板
        const [template] = await db
          .select()
          .from(schema.promptProfiles)
          .where(eq(schema.promptProfiles.id, templateId!))
          .limit(1);
        if (!template) {
          return { success: false, error: "Template not found" };
        }
        // 更新使用次数和最后使用时间
        await db
          .update(schema.promptProfiles)
          .set({
            usageCount: sql`${schema.promptProfiles.usageCount} + 1`,
            lastUsedAt: new Date(),
          })
          .where(eq(schema.promptProfiles.id, templateId!));
        return { success: true, prompt: template.systemPrompt, applied: true };

      case "recordUsage":
        // 记录模板使用结果（成功/失败）
        if (templateId && typeof success === "boolean") {
          await db
            .update(schema.promptProfiles)
            .set({
              [success ? "successCount" : "failCount"]: success
                ? sql`${schema.promptProfiles.successCount} + 1`
                : sql`${schema.promptProfiles.failCount} + 1`,
              lastUsedAt: new Date(),
            })
            .where(eq(schema.promptProfiles.id, templateId));
        }
        return { success: true, recorded: true };

      case "list":
        // 列出所有模板 - 按成功率和使用次数排序
        const listConditions = [eq(schema.promptProfiles.isTemplate, true)];
        if (category) {
          listConditions.push(eq(schema.promptProfiles.category, category));
        }
        const all = await db
          .select({
            id: schema.promptProfiles.id,
            name: schema.promptProfiles.name,
            category: schema.promptProfiles.category,
            tags: schema.promptProfiles.tags,
            usageCount: schema.promptProfiles.usageCount,
            successCount: schema.promptProfiles.successCount,
            failCount: schema.promptProfiles.failCount,
            successRate: successRateExpr.as("success_rate"),
          })
          .from(schema.promptProfiles)
          .where(and(...listConditions))
          // 按成功率降序，使用次数降序作为次要排序
          .orderBy(desc(successRateExpr), desc(schema.promptProfiles.usageCount))
          .limit(50);
        return { templates: all };

      default:
        return { success: false, error: "Unknown action" };
    }
  },
  {
    name: "managePrompt",
    description:
      "统一的 Prompt 管理工具：修改当前 prompt、保存/搜索/应用模板、根据反馈优化。用于管理写作风格、图片风格、内容结构等模板。",
    schema: z.object({
      action: z
        .enum(["modify", "save", "search", "apply", "list", "optimize", "recordUsage"])
        .describe("操作类型"),
      agentName: z.string().nullable().optional().describe("要修改的 agent 名称"),
      prompt: z.string().nullable().optional().describe("新的 prompt 内容"),
      feedback: z.string().nullable().optional().describe("审核反馈,用于优化 prompt"),
      templateId: z.number().nullable().optional().describe("模板 ID (apply 时使用)"),
      templateName: z.string().nullable().optional().describe("模板名称 (save 时使用)"),
      category: z
        .enum(["image_style", "writing_tone", "content_structure"])
        .nullable()
        .optional()
        .describe("模板分类"),
      tags: z.array(z.string()).nullable().optional().describe("模板标签"),
      query: z.string().nullable().optional().describe("搜索关键词"),
      success: z.boolean().nullable().optional().describe("记录使用时是否成功 (recordUsage 时使用)"),
    }),
  }
);

// 导出工具数组
export const promptTools = [managePromptTool];

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { db, schema, getDatabase } from "../../db";
import { getTagStats, getTopTitles, getLatestTrendReport } from "../../services/xhs/analytics/insightService";
import { enqueueTask } from "../../services/xhs/llm/generationQueue";
import { analyzeReferenceImage } from "../../services/xhs/llm/geminiClient";
import { searchWeb } from "../../services/tavilySearch";
import { generateImageWithReference as generateWithProvider } from "../../services/xhs/integration/imageProvider";
import { getSetting } from "../../settings";

// Tool 1: 搜索已抓取的笔记
export const searchNotesTool = tool(
  async ({ query, themeId, limit }) => {
    const queryDb = getDatabase();
    let dbQuery = queryDb
      .from("topics")
      .select("id, title, desc, like_count, collect_count, comment_count, created_at")
      .ilike("title", `%${query}%`)
      .order("like_count", { ascending: false })
      .limit(limit);

    if (themeId) {
      dbQuery = dbQuery.eq("theme_id", themeId);
    }

    const { data, error } = await dbQuery;
    if (error) return JSON.stringify({ error: error.message });

    return JSON.stringify({
      count: data?.length || 0,
      notes: data?.map((n) => ({
        title: n.title,
        desc: n.desc?.slice(0, 200),
        likes: n.like_count,
        collects: n.collect_count,
      })),
    });
  },
  {
    name: "searchNotes",
    description: "搜索已抓取的小红书笔记，根据关键词查找相关内容作为创作参考",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
      themeId: z.number().optional().describe("限定主题ID"),
      limit: z.number().default(10).describe("返回数量"),
    }),
  }
);

// Tool 2: 分析热门标签
export const analyzeTopTagsTool = tool(
  async ({ themeId, days }) => {
    const tags = await getTagStats(themeId, { days });
    return JSON.stringify({
      topTags: tags.slice(0, 15).map((t) => ({
        tag: t.tag,
        count: t.count,
        weight: t.weight,
      })),
    });
  },
  {
    name: "analyzeTopTags",
    description: "分析指定主题下的热门标签和互动数据，了解当前流行趋势",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
      days: z.number().default(7).describe("分析天数范围"),
    }),
  }
);

// Tool 3: 获取趋势报告
export const getTrendReportTool = tool(
  async ({ themeId }) => {
    const report = await getLatestTrendReport(themeId);
    if (!report) {
      return JSON.stringify({ error: "No trend report found for this theme" });
    }
    return JSON.stringify({
      stats: report.stats,
      analysis: report.analysis,
    });
  },
  {
    name: "getTrendReport",
    description: "获取主题的趋势报告，包含今日数据统计和AI分析",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
    }),
  }
);

// Tool 4: 获取爆款标题
export const getTopTitlesTool = tool(
  async ({ themeId, limit, sortBy }) => {
    const titles = await getTopTitles(themeId, limit, { sortBy });
    return JSON.stringify({
      titles: titles.map((t) => ({
        title: t.title,
        likes: t.like_count,
        collects: t.collect_count,
        comments: t.comment_count,
      })),
    });
  },
  {
    name: "getTopTitles",
    description: "获取指定主题下的爆款标题列表，用于学习标题写作技巧",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
      limit: z.number().default(20).describe("返回数量"),
      sortBy: z
        .enum(["engagement", "likes", "collects", "comments", "recent"])
        .default("engagement")
        .describe("排序方式"),
    }),
  }
);

// Tool 5: 生成封面图
export const generateImageTool = tool(
  async ({ prompt, style }) => {
    const stylePrompts: Record<string, string> = {
      realistic: "realistic photo style, high quality",
      illustration: "illustration style, colorful, artistic",
      minimalist: "minimalist design, clean, simple",
    };

    const finalPrompt = `${prompt}, ${stylePrompts[style] || stylePrompts.realistic}, suitable for xiaohongshu cover`;

    const task = await enqueueTask({ prompt: finalPrompt });
    return JSON.stringify({
      taskId: task.id,
      status: "queued",
      message: "图片生成任务已加入队列，请稍后查看结果",
    });
  },
  {
    name: "generateImage",
    description: "根据提示词生成小红书封面图，返回任务ID",
    schema: z.object({
      prompt: z.string().describe("图片生成提示词，描述想要的封面内容"),
      style: z
        .enum(["realistic", "illustration", "minimalist"])
        .default("realistic")
        .describe("图片风格"),
    }),
  }
);

// Tool 6: 分析参考图风格
export const analyzeReferenceImageTool = tool(
  async ({ imageUrl }) => {
    try {
      const analysis = await analyzeReferenceImage(imageUrl);
      return JSON.stringify({
        success: true,
        analysis,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "analyzeReferenceImage",
    description: "分析参考图的视觉风格特征，提取风格描述用于后续图片生成",
    schema: z.object({
      imageUrl: z.string().describe("参考图 URL 或 base64 数据"),
    }),
  }
);

// Tool 7: 带参考图生成图片 (支持 gemini/jimeng，多参考图) - 默认版 (兼容性保留)
export const generateImageWithReferenceTool = tool(
  async ({ prompt, referenceImageUrls, sequence, role, creativeId, provider }) => {
    try {
      const result = await generateWithProvider({
        prompt,
        referenceImageUrls: referenceImageUrls || [],
        provider: provider as "gemini" | "jimeng" | undefined,
        aspectRatio: "3:4",
      });

      const outputDir = path.join(process.cwd(), "public", "generated");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const filename = `img_${Date.now()}_${sequence}.png`;
      const imagePath = path.join(outputDir, filename);
      fs.writeFileSync(imagePath, result.imageBuffer);

      return JSON.stringify({
        success: true,
        sequence,
        role,
        imageSize: result.imageBuffer.length,
        path: imagePath,
        message: `图片生成成功 (${result.provider})`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message || String(error) });
    }
  },
  {
    name: "generate_with_reference",
    description: "根据参考图生成小红书配图",
    schema: z.object({
      prompt: z.string().describe("生图提示词"),
      referenceImageUrls: z.array(z.string()).optional().describe("参考图 URL 数组"),
      sequence: z.number().describe("图片序号 (0=封面)"),
      role: z.enum(["cover", "step", "detail", "result", "comparison"]).describe("图片角色"),
      creativeId: z.number().optional().describe("关联创意ID"),
      provider: z.enum(["gemini", "jimeng"]).optional().describe("服务商"),
    }),
  }
);

/**
 * 工厂函数：创建简化的批量生图工具
 * LLM 只需要传递 prompt 列表，其他参数（参考图、provider、sequence、role）都自动处理
 */
export function createReferenceImageTools(fixedUrls: string[]) {
  console.log(`[createReferenceImageTools] 创建工具，固定参考图: ${fixedUrls.length} 个`);

  const genBatch = tool(
    async ({ prompts }) => {
      console.log(`[generate_images] 开始批量生成 ${prompts.length} 张图片`);
      console.log(`[generate_images] 使用固定参考图: ${fixedUrls.length} 个`);

      // 从设置中读取默认 provider
      const defaultProvider = (await getSetting('imageGenProvider')) || 'jimeng';
      console.log(`[generate_images] provider: ${defaultProvider}`);

      const results: any[] = [];
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        const sequence = i; // 自动分配序号
        const role = i === 0 ? 'cover' : 'step'; // 第一张是封面，其他是步骤图

        try {
          console.log(`[generate_images] 生成第 ${i + 1}/${prompts.length} 张 (seq=${sequence}, role=${role})`);
          const result = await generateWithProvider({
            prompt,
            referenceImageUrls: fixedUrls, // 使用闭包中的固定 URL
            provider: defaultProvider as "gemini" | "jimeng",
            aspectRatio: "3:4",
          });

          const outputDir = path.join(process.cwd(), "public", "generated");
          if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
          const filename = `img_${Date.now()}_${sequence}.png`;
          const imagePath = path.join(outputDir, filename);
          fs.writeFileSync(imagePath, result.imageBuffer);

          console.log(`[generate_images] 第 ${i + 1} 张成功 (${Math.round(result.imageBuffer.length / 1024)}KB)`);
          results.push({ sequence, role, success: true, path: imagePath });
        } catch (error: any) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[generate_images] 第 ${i + 1} 张失败: ${errorMsg}`);
          results.push({ sequence, role, success: false, error: errorMsg });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return JSON.stringify({
        total: prompts.length,
        success: successCount,
        failed: prompts.length - successCount,
        results,
        message: `批量生成完成: ${successCount}/${prompts.length} 成功`,
      });
    },
    {
      name: "generate_images",
      description: "批量生成小红书配图。只需传递提示词列表，参考图、序号、角色会自动处理。第一张自动设为封面，其他为步骤图。",
      schema: z.object({
        prompts: z.array(z.string()).describe("图片生成提示词列表，按顺序生成"),
      }),
    }
  );

  return [genBatch]; // 只返回一个工具，简化 LLM 的选择
}


// Tool 7b: 批量生成图片 (串行执行，避免并发限流)
export const generateImagesBatchTool = tool(
  async ({ images, referenceImageUrls, provider }) => {
    console.log(`[generate_images_batch] 开始批量生成 ${images.length} 张图片, provider=${provider}`);
    console.log(`[generate_images_batch] referenceImageUrls: ${referenceImageUrls?.length || 0} 个, 类型: ${referenceImageUrls?.[0]?.slice(0, 50)}...`);
    const results: { sequence: number; role: string; success: boolean; path?: string; error?: string }[] = [];

    for (const img of images) {
      console.log(`[generate_images_batch] 生成 seq=${img.sequence}, role=${img.role}`);
      try {
        const result = await generateWithProvider({
          prompt: img.prompt,
          referenceImageUrls,
          provider: provider as "gemini" | "jimeng" | undefined,
          aspectRatio: "3:4",
        });

        // 保存图片
        const outputDir = path.join(process.cwd(), "public", "generated");
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const filename = `img_${Date.now()}_${img.sequence}.png`;
        const imagePath = path.join(outputDir, filename);
        fs.writeFileSync(imagePath, result.imageBuffer);

        console.log(`[generate_images_batch] seq=${img.sequence} 成功 (${Math.round(result.imageBuffer.length / 1024)}KB)`);
        results.push({
          sequence: img.sequence,
          role: img.role,
          success: true,
          path: imagePath,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[generate_images_batch] seq=${img.sequence} 失败: ${errorMsg}`);
        results.push({
          sequence: img.sequence,
          role: img.role,
          success: false,
          error: errorMsg,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return JSON.stringify({
      total: images.length,
      success: successCount,
      failed: images.length - successCount,
      results,
      message: `批量生成完成: ${successCount}/${images.length} 成功`,
    });
  },
  {
    name: "generate_images_batch",
    description: "批量生成多张小红书配图（串行执行，避免并发限流）。一次调用生成所有图片，内部串行处理。",
    schema: z.object({
      images: z.array(z.object({
        sequence: z.number().describe("图片序号 (0=封面)"),
        role: z.enum(["cover", "step", "detail", "result", "comparison"]).describe("图片角色"),
        prompt: z.string().describe("图片生成提示词"),
      })).describe("要生成的图片列表"),
      referenceImageUrls: z.array(z.string()).optional().describe("参考图 URL 数组，支持传递多张参考图（每张图都会应用到所有生成图片）"),
      provider: z.enum(["gemini", "jimeng"]).optional().describe("图片生成服务商，默认 jimeng"),
    }),
  }
);

// Tool 8: 联网搜索 (Tavily, 带缓存)
export const webSearchTool = tool(
  async ({ query, maxResults, forceRefresh }) => {
    try {
      const result = await searchWeb(query, {
        maxResults: maxResults || 5,
        forceRefresh: forceRefresh || false,
      });

      return JSON.stringify({
        query: result.query,
        answer: result.answer,
        results: result.results.slice(0, maxResults || 5).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content?.slice(0, 300),
          score: r.score,
        })),
        cached: result.cached,
        responseTimeMs: result.responseTime,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "webSearch",
    description: "联网搜索最新信息，支持搜索小红书、知乎、百度等平台内容，获取实时热点和趋势分析。相同查询 30 分钟内不重复搜索（开发阶段节省 token）。",
    schema: z.object({
      query: z.string().describe("搜索关键词，如 '2024 小红书 AI 教程 热门'"),
      maxResults: z.number().default(5).describe("最大返回结果数"),
      forceRefresh: z.boolean().default(false).describe("是否强制刷新缓存"),
    }),
  }
);

// Tool 9: 保存图片规划
export const saveImagePlanTool = tool(
  async ({ creativeId, plans }) => {
    try {
      const queryDb = getDatabase();
      const insertData = plans.map((p) => ({
        creative_id: creativeId,
        sequence: p.sequence,
        role: p.role,
        description: p.description,
        status: "planned",
      }));

      const { data, error } = await queryDb
        .from("image_plans")
        .insert(insertData)
        .select("id, sequence, role");

      if (error) throw error;

      return JSON.stringify({
        success: true,
        planIds: data?.map((p) => p.id) || [],
        count: data?.length || 0,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "saveImagePlan",
    description: "保存图片序列规划到数据库",
    schema: z.object({
      creativeId: z.number().describe("创意ID"),
      plans: z.array(z.object({
        sequence: z.number().describe("图片序号"),
        role: z.string().describe("图片角色"),
        description: z.string().describe("图片内容描述"),
      })).describe("图片规划列表"),
    }),
  }
);

// 别名导出 (兼容 multiAgentSystem.ts 的命名)
export const analyzeTagsTool = analyzeTopTagsTool;
export const analyzeStyleTool = analyzeReferenceImageTool;
export const generateWithReferenceTool = generateImageWithReferenceTool;

// 导入 promptTools
export { managePromptTool, promptTools } from "./promptTools";

// 导入 intentTools (保留兼容，但推荐使用 askUserTool)
export { recommendTemplatesTool, intentTools, detectIntent } from "./intentTools";
export type { IntentType, IntentResult } from "./intentTools";

// 导入 askUserTool - 统一用户确认工具
import { askUserTool, askUserTools } from "./askUserTool";
export { askUserTool, askUserTools };
export type { AskUserOption, UserResponse, AskUserInterrupt } from "./askUserTool";

// 工具分组导出 (用于 multiAgentSystem)
export const researchTools = [searchNotesTool, analyzeTopTagsTool, getTopTitlesTool, getTrendReportTool, webSearchTool, askUserTool];
export const imageTools = [generateImageTool];
export const styleTools = [analyzeReferenceImageTool];
export const plannerTools = [saveImagePlanTool];
// 注意：referenceImageTools 现在为空，因为动态工具会在 imageAgentNode 中创建
export const referenceImageTools: any[] = [];

// 导出所有工具
export const xhsTools = [
  searchNotesTool,
  analyzeTopTagsTool,
  getTrendReportTool,
  getTopTitlesTool,
  generateImageTool,
  analyzeReferenceImageTool,
  generateImageWithReferenceTool,
  saveImagePlanTool,
  webSearchTool,
];

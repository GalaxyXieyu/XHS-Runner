import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { supabase } from "../../supabase";
import { db, schema } from "../../db";
import { getTagStats, getTopTitles, getLatestTrendReport } from "../../services/xhs/analytics/insightService";
import { enqueueTask } from "../../services/xhs/llm/generationQueue";
import { analyzeReferenceImage } from "../../services/xhs/llm/geminiClient";
import { generateImageWithReference as generateWithProvider } from "../../services/xhs/integration/imageProvider";

// Tool 1: 搜索已抓取的笔记
export const searchNotesTool = tool(
  async ({ query, themeId, limit }) => {
    let dbQuery = supabase
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

// Tool 7: 带参考图生成图片 (支持 gemini/jimeng)
export const generateImageWithReferenceTool = tool(
  async ({ prompt, referenceImageUrl, sequence, role, creativeId, provider }) => {
    try {
      const result = await generateWithProvider({
        prompt,
        referenceImageUrl,
        provider: provider as "gemini" | "jimeng" | undefined,
        aspectRatio: "3:4",
      });

      // 保存图片到本地文件系统
      const outputDir = path.join(process.cwd(), "public", "generated");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const filename = `img_${Date.now()}_${sequence}.png`;
      const imagePath = path.join(outputDir, filename);
      fs.writeFileSync(imagePath, result.imageBuffer);

      // 创建生成任务记录（可选，不影响图片生成结果）
      let taskId: number | null = null;
      try {
        const { data: task, error } = await supabase
          .from("generation_tasks")
          .insert({
            creative_id: creativeId || null,
            status: "done",
            prompt,
            model: result.provider,
            reference_image_url: referenceImageUrl,
            sequence,
            result_json: JSON.stringify({ role, imageSize: result.imageBuffer.length, path: imagePath }),
          })
          .select("id")
          .single();
        if (!error && task) {
          taskId = task.id;
        }
      } catch {}

      const response = {
        success: true,
        taskId,
        sequence,
        role,
        imageSize: result.imageBuffer.length,
        path: imagePath,
        message: `图片生成成功 (${result.provider})`,
      };
      return JSON.stringify(response);
    } catch (error) {
      const errorMsg = error instanceof Error
        ? error.message
        : (typeof error === 'object' ? JSON.stringify(error) : String(error));
      return JSON.stringify({
        success: false,
        error: errorMsg,
      });
    }
  },
  {
    name: "generate_with_reference",
    description: "根据参考图风格生成小红书配图，支持指定图片序号和角色",
    schema: z.object({
      prompt: z.string().describe("中文或英文生图提示词"),
      referenceImageUrl: z.string().describe("参考图 URL"),
      sequence: z.number().describe("图片序号 (0=封面)"),
      role: z.enum(["cover", "step", "detail", "result", "comparison"]).describe("图片角色"),
      creativeId: z.number().optional().describe("关联的创意ID"),
      provider: z.enum(["gemini", "jimeng"]).optional().describe("图片生成服务商"),
    }),
  }
);

// Tool 8: 保存图片规划
export const saveImagePlanTool = tool(
  async ({ creativeId, plans }) => {
    try {
      const insertData = plans.map((p) => ({
        creative_id: creativeId,
        sequence: p.sequence,
        role: p.role,
        description: p.description,
        status: "planned",
      }));

      const { data, error } = await supabase
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
export { askUserTool, askUserTools } from "./askUserTool";
export type { AskUserOption, UserResponse, AskUserInterrupt } from "./askUserTool";

// 工具分组导出 (用于 multiAgentSystem)
export const researchTools = [searchNotesTool, analyzeTopTagsTool, getTopTitlesTool, getTrendReportTool];
export const imageTools = [generateImageTool];
export const styleTools = [analyzeReferenceImageTool];
export const plannerTools = [saveImagePlanTool];
export const referenceImageTools = [generateImageWithReferenceTool];

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
];

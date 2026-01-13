import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../../supabase";
import { getTagStats, getTopTitles, getLatestTrendReport } from "../../services/xhs/insightService";
import { enqueueTask } from "../../services/xhs/generationQueue";

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

// 导出所有工具
export const xhsTools = [
  searchNotesTool,
  analyzeTopTagsTool,
  getTrendReportTool,
  getTopTitlesTool,
  generateImageTool,
];

import { NextApiRequest, NextApiResponse } from "next";
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSPagesRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { supabase } from "@/server/supabase";
import { getTagStats, getTopTitles, getLatestTrendReport } from "@/server/services/xhs/analytics/insightService";
import { enqueueGeneration } from "@/server/services/xhs/llm/generationQueue";

// 获取 LLM 配置用于 CopilotKit
async function getLLMConfig() {
  const { data } = await supabase
    .from("llm_providers")
    .select("base_url, api_key, model_name")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .maybeSingle();

  if (data?.base_url && data?.api_key && data?.model_name) {
    return {
      baseUrl: data.base_url,
      apiKey: data.api_key,
      model: data.model_name,
    };
  }

  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const llmConfig = await getLLMConfig();

  const openai = new OpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseUrl,
  });

  const serviceAdapter = new OpenAIAdapter({ openai } as any);

  const runtime = new CopilotRuntime({
    actions: (() => [
      {
        name: "searchNotes",
        description: "搜索已抓取的小红书笔记，根据关键词查找相关内容作为创作参考",
        parameters: [
          { name: "query", type: "string", description: "搜索关键词", required: true },
          { name: "themeId", type: "number", description: "限定主题ID" },
          { name: "limit", type: "number", description: "返回数量，默认10" },
        ],
        handler: async ({ query, themeId, limit = 10 }: { query: string; themeId?: number; limit?: number }) => {
          let dbQuery = supabase
            .from("topics")
            .select("id, title, desc, like_count, collect_count, comment_count")
            .ilike("title", `%${query}%`)
            .order("like_count", { ascending: false })
            .limit(limit);

          if (themeId) {
            dbQuery = dbQuery.eq("theme_id", themeId);
          }

          const { data, error } = await dbQuery;
          if (error) return { error: error.message };

          return {
            count: data?.length || 0,
            notes: data?.map((n) => ({
              title: n.title,
              desc: (n.desc as string)?.slice(0, 200),
              likes: n.like_count,
              collects: n.collect_count,
            })),
          };
        },
      },
      {
        name: "analyzeTopTags",
        description: "分析指定主题下的热门标签和互动数据，了解当前流行趋势",
        parameters: [
          { name: "themeId", type: "number", description: "主题ID", required: true },
          { name: "days", type: "number", description: "分析天数范围，默认7天" },
        ],
        handler: async ({ themeId, days = 7 }: { themeId: number; days?: number }) => {
          const tags = await getTagStats(themeId, { days });
          return {
            topTags: tags.slice(0, 15).map((t) => ({
              tag: t.tag,
              count: t.count,
              weight: t.weight,
            })),
          };
        },
      },
      {
        name: "getTopTitles",
        description: "获取指定主题下的爆款标题列表，用于学习标题写作技巧",
        parameters: [
          { name: "themeId", type: "number", description: "主题ID", required: true },
          { name: "limit", type: "number", description: "返回数量，默认20" },
        ],
        handler: async ({ themeId, limit = 20 }: { themeId: number; limit?: number }) => {
          const titles = await getTopTitles(themeId, limit);
          return {
            titles: titles.map((t) => ({
              title: t.title,
              likes: t.like_count,
              collects: t.collect_count,
            })),
          };
        },
      },
      {
        name: "getTrendReport",
        description: "获取主题的趋势报告，包含今日数据统计和AI分析",
        parameters: [
          { name: "themeId", type: "number", description: "主题ID", required: true },
        ],
        handler: async ({ themeId }: { themeId: number }) => {
          const report = await getLatestTrendReport(themeId);
          if (!report) {
            return { error: "暂无趋势报告，请先生成" };
          }
          return {
            stats: report.stats,
            analysis: report.analysis,
            reportDate: report.report_date,
          };
        },
      },
      {
        name: "generateImage",
        description: "根据提示词生成小红书封面图，返回任务ID",
        parameters: [
          { name: "prompt", type: "string", description: "图片生成提示词", required: true },
          { name: "style", type: "string", description: "图片风格: realistic, illustration, minimalist" },
        ],
        handler: async ({ prompt, style = "realistic" }: { prompt: string; style?: string }) => {
          const stylePrompts: Record<string, string> = {
            realistic: "realistic photo style, high quality",
            illustration: "illustration style, colorful, artistic",
            minimalist: "minimalist design, clean, simple",
          };

          const finalPrompt = `${prompt}, ${stylePrompts[style] || stylePrompts.realistic}, suitable for xiaohongshu cover`;
          const task = await enqueueGeneration({ prompt: finalPrompt });

          return {
            taskId: task.id,
            status: "queued",
            message: "图片生成任务已加入队列",
          };
        },
      },
    ]) as any,
  });

  const handleRequest = copilotRuntimeNextJSPagesRouterEndpoint({
    endpoint: "/api/copilotkit",
    runtime,
    serviceAdapter,
  });

  return await handleRequest(req, res);
};

export default handler;

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Tavily 搜索服务
 * 支持查询缓存，相同 query 不重复搜索
 * API Key 从数据库 extension_services 表读取，支持前端配置
 */

import { z } from "zod";
import { getTavilyConfig } from "./tavilyService";

// ============ 缓存配置 ============
interface CacheEntry {
  result: TavilySearchResult;
  timestamp: number;
}

const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 30; // 30分钟缓存

// ============ 类型定义 ============
export interface TavilySearchResult {
  query: string;
  answer: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  images: string[];
  responseTime: number;
  cached: boolean;
}

// ============ Tavily API 调用 ============
async function tavilySearchRaw(query: string, apiKey: string, options?: { maxResults?: number; includeImages?: boolean }): Promise<TavilySearchResult> {
  const maxResults = options?.maxResults || 5;
  const includeImages = options?.includeImages || false;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_images: includeImages,
      include_answer: true,
      include_raw_content: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    query: data.query,
    answer: data.answer || "",
    results: (data.results || []).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      content: r.content || r.snippet || "",
      score: r.score || 0,
    })),
    images: [],
    responseTime: 0,
    cached: false,
  };
}

// ============ 带缓存的搜索函数 ============
export async function searchWeb(
  query: string,
  options?: { maxResults?: number; includeImages?: boolean; forceRefresh?: boolean }
): Promise<TavilySearchResult> {
  const cacheKey = query.trim().toLowerCase();
  const { maxResults = 5, includeImages = false, forceRefresh = false } = options || {};

  // 获取 API Key（从数据库或环境变量）
  const config = await getTavilyConfig();

  if (!config.apiKey) {
    throw new Error("Tavily API Key 未配置，请先在设置页面配置");
  }

  // 检查缓存
  if (!forceRefresh) {
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[searchWeb] Cache hit for: "${query}"`);
      return { ...cached.result, cached: true };
    }
  }

  // 执行搜索
  console.log(`[searchWeb] Fetching from Tavily: "${query}"`);
  const startTime = Date.now();
  const result = await tavilySearchRaw(query, config.apiKey, { maxResults, includeImages });
  result.responseTime = Date.now() - startTime;

  // 保存到缓存
  SEARCH_CACHE.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  console.log(`[searchWeb] Cached result for: "${query}" (${result.responseTime}ms)`);

  return { ...result, cached: false };
}

// ============ 工具函数 ============
export function clearSearchCache(): void {
  SEARCH_CACHE.clear();
  console.log("[searchWeb] Cache cleared");
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: SEARCH_CACHE.size,
    keys: Array.from(SEARCH_CACHE.keys()),
  };
}

// ============ Zod Schema (供工具使用) ============
export const searchWebSchema = {
  query: z.string().describe("搜索关键词"),
  maxResults: z.number().default(5).describe("最大返回结果数"),
  forceRefresh: z.boolean().default(false).describe("是否强制刷新缓存"),
};

export type SearchWebParams = z.infer<z.object<typeof searchWebSchema>>;

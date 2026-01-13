import { db, schema } from '../../../db';
import { and, desc as descOrder, eq, gte, lt, sql } from 'drizzle-orm';
import { getSettings } from '../../../settings';

export interface InsightFilter {
  days?: number; // 时间范围：7/30/0(全部)
  sortBy?: 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';
}

function buildCutoffDate(days?: number): Date | null {
  if (!days || days <= 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// 获取 LLM 配置（优先使用指定的 provider，否则使用默认 provider，最后回退到 settings）
async function getLLMConfig(providerId?: number): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  const providers = schema.llmProviders;

  if (providerId) {
    const rows = await db
      .select({
        baseUrl: providers.baseUrl,
        apiKey: providers.apiKey,
        model: providers.modelName,
      })
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    const row = rows[0];
    if (row?.baseUrl && row?.apiKey && row?.model) {
      return { baseUrl: row.baseUrl, apiKey: row.apiKey, model: row.model };
    }
  }

  const defaultRows = await db
    .select({
      baseUrl: providers.baseUrl,
      apiKey: providers.apiKey,
      model: providers.modelName,
    })
    .from(providers)
    .where(and(eq(providers.isDefault, true), eq(providers.isEnabled, true)))
    .limit(1);

  const defaultRow = defaultRows[0];
  if (defaultRow?.baseUrl && defaultRow?.apiKey && defaultRow?.model) {
    return { baseUrl: defaultRow.baseUrl, apiKey: defaultRow.apiKey, model: defaultRow.model };
  }

  const settings = await getSettings();
  if (settings.llmBaseUrl && settings.llmApiKey && settings.llmModel) {
    return { baseUrl: settings.llmBaseUrl, apiKey: settings.llmApiKey, model: settings.llmModel };
  }
  return null;
}

// 导出给 API 使用的 LLM 配置获取函数
export async function getLLMConfigForAPI(providerId?: number): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  return getLLMConfig(providerId);
}

// 获取提示词模板
async function getPromptProfile(promptId: number): Promise<{ system_prompt: string; user_template: string } | null> {
  const profiles = schema.promptProfiles;
  const rows = await db
    .select({
      system_prompt: profiles.systemPrompt,
      user_template: profiles.userTemplate,
    })
    .from(profiles)
    .where(eq(profiles.id, promptId))
    .limit(1);

  return rows[0] || null;
}

// 默认分析提示词
function getDefaultAnalysisPrompt(titleList: string): string {
  return `分析以下小红书爆款笔记标题的共同特点，总结3-5条爆款标题公式：\n\n${titleList}\n\n请用简洁的中文回答，每条公式用一行，格式如：\n1. 公式名称：具体说明\n\n注意：直接输出分析结果，不要输出思考过程。`;
}

// 停用词列表
const STOP_WORDS = new Set([
  '的',
  '了',
  '是',
  '在',
  '我',
  '有',
  '和',
  '就',
  '不',
  '人',
  '都',
  '一',
  '一个',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  '那',
  '什么',
  '怎么',
  '为什么',
  '可以',
  '这个',
  '那个',
  '还是',
  '但是',
  '如果',
  '因为',
  '所以',
  '然后',
  '或者',
  '而且',
  '虽然',
  '不过',
  '只是',
  '已经',
  '一直',
  '还有',
  '真的',
  '其实',
  '感觉',
  '觉得',
  '知道',
  '应该',
  '可能',
  '需要',
  '希望',
  '喜欢',
  '想要',
  '开始',
  '时候',
  '现在',
  '今天',
  '明天',
  '昨天',
]);

// 从标题和正文中提取标签，支持互动加权
function extractTags(rows: { title: string; desc?: string | null; like_count?: unknown; collect_count?: unknown }[]): { tag: string; count: number; weight: number }[] {
  const tagData: Record<string, { count: number; weight: number }> = {};
  const hashtagPattern = /[#＃]([\u4e00-\u9fa5a-zA-Z0-9]+)/g;

  for (const row of rows) {
    const likeCount = Number(row.like_count ?? 0) || 0;
    const collectCount = Number(row.collect_count ?? 0) || 0;
    const engagement = likeCount + collectCount * 2;
    const seen = new Set<string>();
    const text = row.desc || '';
    for (const match of text.matchAll(hashtagPattern)) {
      const tag = match[1].trim();
      if (tag.length >= 2 && tag.length <= 20 && !STOP_WORDS.has(tag) && !seen.has(tag)) {
        seen.add(tag);
        if (!tagData[tag]) tagData[tag] = { count: 0, weight: 0 };
        tagData[tag].count++;
        tagData[tag].weight += engagement;
      }
    }
  }

  return Object.entries(tagData)
    .filter(([_, d]) => d.count >= 1)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 20)
    .map(([tag, d]) => ({ tag: `#${tag}`, count: d.count, weight: d.weight }));
}

// 清理LLM返回内容（保留思考过程，只做基本清理）
function cleanLLMResponse(content: string): string {
  return content.trim();
}

function buildTopicWhere(themeId: number, filter?: InsightFilter) {
  const conditions: any[] = [eq(schema.topics.themeId, themeId)];
  const cutoffDate = buildCutoffDate(filter?.days);
  if (cutoffDate) {
    conditions.push(gte(schema.topics.createdAt, cutoffDate));
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

// 获取热门标题
export async function getTopTitles(themeId: number, limit = 50, filter?: InsightFilter) {
  const where = buildTopicWhere(themeId, filter);
  const topics = schema.topics;

  const orderBys: any[] = [];
  switch (filter?.sortBy) {
    case 'likes':
      orderBys.push(descOrder(topics.likeCount));
      break;
    case 'collects':
      orderBys.push(descOrder(topics.collectCount));
      break;
    case 'comments':
      orderBys.push(descOrder(topics.commentCount));
      break;
    case 'recent':
      orderBys.push(descOrder(topics.createdAt));
      break;
    default:
      orderBys.push(descOrder(topics.likeCount), descOrder(topics.collectCount), descOrder(topics.commentCount));
      break;
  }

  const rows = await db
    .select({
      title: topics.title,
      like_count: topics.likeCount,
      collect_count: topics.collectCount,
      comment_count: topics.commentCount,
      created_at: topics.createdAt,
    })
    .from(topics)
    .where(where)
    .orderBy(...orderBys)
    .limit(limit);

  return rows as any;
}

// 获取标签统计
export async function getTagStats(themeId: number, filter?: InsightFilter) {
  const where = buildTopicWhere(themeId, filter);
  const topics = schema.topics;

  const rows = await db
    .select({
      title: topics.title,
      desc: topics.desc,
      like_count: topics.likeCount,
      collect_count: topics.collectCount,
    })
    .from(topics)
    .where(where);

  return extractTags(rows as any);
}

// 获取主题统计
export async function getThemeStats(themeId: number, filter?: InsightFilter) {
  const where = buildTopicWhere(themeId, filter);
  const topics = schema.topics;

  const rows = await db
    .select({
      total_notes: sql<number>`count(*)`,
      total_likes: sql<number>`coalesce(sum(${topics.likeCount}), 0)`,
      total_collects: sql<number>`coalesce(sum(${topics.collectCount}), 0)`,
    })
    .from(topics)
    .where(where);

  const row = rows[0] as any;
  const totalNotes = Number(row?.total_notes || 0);
  const totalLikes = Number(row?.total_likes || 0);
  const totalCollects = Number(row?.total_collects || 0);
  const avgEngagement = totalNotes > 0 ? (totalLikes + totalCollects * 2) / totalNotes : 0;

  return { totalNotes, totalLikes, totalCollects, avgEngagement };
}

// 获取洞察数据
export async function getInsightData(themeId: number, filter?: InsightFilter) {
  const [tags, topTitles, stats] = await Promise.all([
    getTagStats(themeId, filter),
    getTopTitles(themeId, 10, filter),
    getThemeStats(themeId, filter),
  ]);
  return {
    tags,
    topTitles,
    stats: {
      totalNotes: stats.totalNotes,
      totalTags: tags.length,
      totalTitles: topTitles.length,
      totalEngagement: stats.totalLikes + stats.totalCollects,
      avgEngagement: Math.round(stats.avgEngagement),
    },
  };
}

// ========== 趋势报告功能 ==========

interface TrendStats {
  date: string;
  newNotes: number;
  totalLikes: number;
  totalCollects: number;
  totalComments: number;
  avgEngagement: number;
  topTags: { tag: string; count: number }[];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// 获取某天的统计数据
async function getDayStats(themeId: number, date: string): Promise<TrendStats> {
  const topics = schema.topics;
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${nextDateStr}T00:00:00.000Z`);

  const rows = await db
    .select({
      title: topics.title,
      desc: topics.desc,
      like_count: topics.likeCount,
      collect_count: topics.collectCount,
      comment_count: topics.commentCount,
    })
    .from(topics)
    .where(and(eq(topics.themeId, themeId), gte(topics.createdAt, start), lt(topics.createdAt, end)));

  const totalLikes = rows.reduce((s: number, r: any) => s + Number(r.like_count || 0), 0);
  const totalCollects = rows.reduce((s: number, r: any) => s + Number(r.collect_count || 0), 0);
  const totalComments = rows.reduce((s: number, r: any) => s + Number(r.comment_count || 0), 0);
  const avgEngagement = rows.length > 0 ? Math.round((totalLikes + totalCollects * 2 + totalComments * 3) / rows.length) : 0;

  const tags = extractTags(rows as any);

  return {
    date,
    newNotes: rows.length,
    totalLikes,
    totalCollects,
    totalComments,
    avgEngagement,
    topTags: tags.slice(0, 5).map((t) => ({ tag: t.tag, count: t.count })),
  };
}

// 保存趋势报告到数据库
export async function saveTrendReport(themeId: number, stats: any, analysis: string) {
  const today = getTodayDate();
  const cleaned = cleanLLMResponse(analysis);
  const trendReports = schema.trendReports;

  const existingRows = await db
    .select({ id: trendReports.id })
    .from(trendReports)
    .where(and(eq(trendReports.themeId, themeId), eq(trendReports.reportDate, today)))
    .limit(1);

  const existing = existingRows[0];
  if (existing?.id) {
    await db
      .update(trendReports)
      .set({ stats: JSON.stringify(stats), analysis: cleaned })
      .where(eq(trendReports.id, existing.id));
    return;
  }

  await db.insert(trendReports).values({
    themeId,
    reportDate: today,
    stats: JSON.stringify(stats),
    analysis: cleaned,
  });
}

// 保存标题分析结果到 themes.analytics_json
export async function saveTitleAnalysis(themeId: number, analysis: string) {
  const cleaned = cleanLLMResponse(analysis);
  const analyticsData = {
    title_analysis: cleaned,
    analyzed_at: new Date().toISOString(),
  };

  await db
    .update(schema.themes)
    .set({ analytics: JSON.stringify(analyticsData), updatedAt: new Date() })
    .where(eq(schema.themes.id, themeId));
}

// 获取最新的标题分析结果
export async function getLatestTitleAnalysis(themeId: number): Promise<{ analysis: string; analyzed_at: string } | null> {
  const rows = await db
    .select({ analytics_json: schema.themes.analytics })
    .from(schema.themes)
    .where(eq(schema.themes.id, themeId))
    .limit(1);

  const raw = (rows[0] as any)?.analytics_json;
  if (!raw) return null;

  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (data?.title_analysis) {
    return { analysis: data.title_analysis, analyzed_at: data.analyzed_at };
  }
  return null;
}

// 获取分析提示词数据（供 API 使用）
export async function getAnalysisPromptData(
  themeId: number,
  filter?: InsightFilter,
  promptId?: number
): Promise<{ prompt?: string; error?: string }> {
  const topTitles = await getTopTitles(themeId, 50, filter);
  if (topTitles.length < 5) {
    return { error: '数据不足，请先抓取更多笔记' };
  }

  const titleList = topTitles
    .slice(0, 30)
    .map(
      (t: any, i: number) =>
        `${i + 1}. ${t.title} (赞:${Number(t.like_count || 0)}, 藏:${Number(t.collect_count || 0)}, 评:${Number(t.comment_count || 0)})`
    )
    .join('\n');

  let prompt: string;
  if (promptId) {
    const customPrompt = await getPromptProfile(promptId);
    if (customPrompt) {
      prompt =
        customPrompt.system_prompt +
        '\n\n' +
        (customPrompt.user_template || '').replace('{{titles}}', titleList);
    } else {
      prompt = getDefaultAnalysisPrompt(titleList);
    }
  } else {
    prompt = getDefaultAnalysisPrompt(titleList);
  }

  return { prompt };
}

// 获取趋势报告提示词数据（供 API 使用）
export async function getTrendPromptData(themeId: number): Promise<{ prompt?: string; stats?: any; error?: string }> {
  const today = getTodayDate();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const todayStats = await getDayStats(themeId, today);
  const yesterdayStats = await getDayStats(themeId, yesterdayStr);

  const topTitles = await getTopTitles(themeId, 20, { days: 7 });
  const titleList = topTitles
    .slice(0, 15)
    .map((t: any, i: number) => `${i + 1}. ${t.title}`)
    .join('\n');

  const prompt = `作为小红书运营分析师，根据以下数据生成简短的趋势报告：

今日数据：新增${todayStats.newNotes}篇，点赞${todayStats.totalLikes}，收藏${todayStats.totalCollects}
昨日数据：新增${yesterdayStats.newNotes}篇，点赞${yesterdayStats.totalLikes}，收藏${yesterdayStats.totalCollects}
热门标签：${todayStats.topTags.map((t) => t.tag).join('、') || '暂无'}

近期热门标题：
${titleList || '暂无数据'}

请用3-4句话总结：1)数据变化趋势 2)内容热点方向 3)创作建议
直接输出分析，不要输出思考过程。`;

  return { prompt, stats: todayStats };
}

// 获取最新趋势报告
export async function getLatestTrendReport(
  themeId: number
): Promise<{ stats: TrendStats; analysis: string; report_date: string } | null> {
  const trendReports = schema.trendReports;
  const rows = await db
    .select({
      stats_json: trendReports.stats,
      analysis: trendReports.analysis,
      report_date: trendReports.reportDate,
    })
    .from(trendReports)
    .where(eq(trendReports.themeId, themeId))
    .orderBy(descOrder(trendReports.reportDate))
    .limit(1);

  const row = rows[0] as any;
  if (!row) return null;

  let stats: any = row.stats_json;
  if (typeof stats === 'string') {
    try {
      stats = JSON.parse(stats);
    } catch {
      stats = null;
    }
  }

  return {
    stats,
    analysis: row.analysis,
    report_date: row.report_date,
  };
}

// 获取历史趋势数据（用于图表）
export async function getTrendHistory(themeId: number, days = 7): Promise<TrendStats[]> {
  const result: TrendStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push(await getDayStats(themeId, date.toISOString().split('T')[0]));
  }
  return result;
}

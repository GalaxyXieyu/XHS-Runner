import { getDatabase } from '../../db';
import { getSettings } from '../../settings';

export interface InsightFilter {
  days?: number;        // 时间范围：7/30/0(全部)
  sortBy?: 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';
}

function buildCutoffIso(days?: number): string | null {
  if (!days || days <= 0) return null;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

// 获取 LLM 配置（优先使用指定的 provider，否则使用默认 provider，最后回退到设置）
async function getLLMConfig(providerId?: number): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  const db = getDatabase();

  if (providerId) {
    const { data: row, error } = await db
      .from('llm_providers')
      .select('base_url, api_key, model_name')
      .eq('id', providerId)
      .maybeSingle();
    if (error) throw error;
    if (row?.base_url && row?.api_key && row?.model_name) {
      return { baseUrl: row.base_url, apiKey: row.api_key, model: row.model_name };
    }
  }

  // 查询默认启用的 provider
  const { data: defaultRow, error: defaultError } = await db
    .from('llm_providers')
    .select('base_url, api_key, model_name')
    .eq('is_default', 1)
    .eq('is_enabled', 1)
    .maybeSingle();
  if (defaultError) throw defaultError;
  if (defaultRow?.base_url && defaultRow?.api_key && defaultRow?.model_name) {
    return { baseUrl: defaultRow.base_url, apiKey: defaultRow.api_key, model: defaultRow.model_name };
  }

  // 回退到默认设置
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
  const db = getDatabase();
  const { data, error } = await db
    .from('prompt_profiles')
    .select('system_prompt, user_template')
    .eq('id', promptId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}

// 默认分析提示词
function getDefaultAnalysisPrompt(titleList: string): string {
  return `分析以下小红书爆款笔记标题的共同特点，总结3-5条爆款标题公式：\n\n${titleList}\n\n请用简洁的中文回答，每条公式用一行，格式如：\n1. 公式名称：具体说明\n\n注意：直接输出分析结果，不要输出思考过程。`;
}

// 停用词列表
const STOP_WORDS = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '什么', '怎么', '为什么', '可以', '这个', '那个', '还是', '但是', '如果', '因为', '所以', '然后', '或者', '而且', '虽然', '不过', '只是', '已经', '一直', '还有', '真的', '其实', '感觉', '觉得', '知道', '应该', '可能', '需要', '希望', '喜欢', '想要', '开始', '时候', '现在', '今天', '明天', '昨天']);

// 从标题和正文中提取标签，支持互动加权
function extractTags(rows: { title: string; desc?: string | null; like_count: number; collect_count: number }[]): { tag: string; count: number; weight: number }[] {
  const tagData: Record<string, { count: number; weight: number }> = {};
  const hashtagPattern = /[#＃]([\u4e00-\u9fa5a-zA-Z0-9]+)/g;

  for (const row of rows) {
    const engagement = row.like_count + row.collect_count * 2;
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
  // 保留 <think> 标签内容，只做基本的空白清理
  return content.trim();
}

// 获取热门标题
export async function getTopTitles(themeId: number, limit = 50, filter?: InsightFilter) {
  const db = getDatabase();
  let query = db
    .from('topics')
    .select('title, like_count, collect_count, comment_count, created_at')
    .eq('theme_id', themeId);

  const cutoffIso = buildCutoffIso(filter?.days);
  if (cutoffIso) {
    query = query.gte('created_at', cutoffIso);
  }

  switch (filter?.sortBy) {
    case 'likes':
      query = query.order('like_count', { ascending: false });
      break;
    case 'collects':
      query = query.order('collect_count', { ascending: false });
      break;
    case 'comments':
      query = query.order('comment_count', { ascending: false });
      break;
    case 'recent':
      query = query.order('created_at', { ascending: false });
      break;
    default:
      query = query
        .order('like_count', { ascending: false })
        .order('collect_count', { ascending: false })
        .order('comment_count', { ascending: false });
      break;
  }

  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return (data || []) as any;
}

// 获取标签统计
export async function getTagStats(themeId: number, filter?: InsightFilter) {
  const db = getDatabase();
  let query = db
    .from('topics')
    .select('title, desc, like_count, collect_count')
    .eq('theme_id', themeId);

  const cutoffIso = buildCutoffIso(filter?.days);
  if (cutoffIso) {
    query = query.gte('created_at', cutoffIso);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as any;
  return extractTags(rows);
}

// 获取主题统计
export async function getThemeStats(themeId: number, filter?: InsightFilter) {
  const db = getDatabase();
  let query = db
    .from('topics')
    .select('like_count, collect_count', { count: 'exact' })
    .eq('theme_id', themeId);

  const cutoffIso = buildCutoffIso(filter?.days);
  if (cutoffIso) {
    query = query.gte('created_at', cutoffIso);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data || []) as Array<{ like_count?: number | null; collect_count?: number | null }>;
  const totalNotes = Number(count || 0);
  const totalLikes = rows.reduce((s, r) => s + Number(r.like_count || 0), 0);
  const totalCollects = rows.reduce((s, r) => s + Number(r.collect_count || 0), 0);
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
      avgEngagement: Math.round(stats.avgEngagement)
    }
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
  const db = getDatabase();
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const start = new Date(`${date}T00:00:00.000Z`).toISOString();
  const end = new Date(`${nextDateStr}T00:00:00.000Z`).toISOString();

  const { data, error } = await db
    .from('topics')
    .select('title, like_count, collect_count, comment_count')
    .eq('theme_id', themeId)
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) throw error;
  const rows = (data || []) as any;

  const totalLikes = rows.reduce((s: number, r: any) => s + (r.like_count || 0), 0);
  const totalCollects = rows.reduce((s: number, r: any) => s + (r.collect_count || 0), 0);
  const totalComments = rows.reduce((s: number, r: any) => s + (r.comment_count || 0), 0);
  const avgEngagement = rows.length > 0 ? Math.round((totalLikes + totalCollects * 2 + totalComments * 3) / rows.length) : 0;

  const tags = extractTags(rows.map((r: any) => ({ title: r.title, like_count: r.like_count || 0, collect_count: r.collect_count || 0 })));

  return {
    date,
    newNotes: rows.length,
    totalLikes,
    totalCollects,
    totalComments,
    avgEngagement,
    topTags: tags.slice(0, 5).map(t => ({ tag: t.tag, count: t.count }))
  };
}

// 保存趋势报告到数据库
export async function saveTrendReport(themeId: number, stats: any, analysis: string) {
  const db = getDatabase();
  const today = getTodayDate();
  const cleaned = cleanLLMResponse(analysis);

  const { data: existing, error: lookupError } = await db
    .from('trend_reports')
    .select('id')
    .eq('theme_id', themeId)
    .eq('report_date', today)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await db
      .from('trend_reports')
      .update({ stats_json: JSON.stringify(stats), analysis: cleaned })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from('trend_reports')
    .insert({
      theme_id: themeId,
      report_date: today,
      stats_json: JSON.stringify(stats),
      analysis: cleaned,
    });
  if (error) throw error;
}

// 保存标题分析结果到 themes.analytics_json
export async function saveTitleAnalysis(themeId: number, analysis: string) {
  const db = getDatabase();
  const cleaned = cleanLLMResponse(analysis);
  const analyticsData = {
    title_analysis: cleaned,
    analyzed_at: new Date().toISOString(),
  };
  const { error } = await db
    .from('themes')
    .update({ analytics_json: JSON.stringify(analyticsData) })
    .eq('id', themeId);
  if (error) throw error;
}

// 获取最新的标题分析结果
export async function getLatestTitleAnalysis(themeId: number): Promise<{ analysis: string; analyzed_at: string } | null> {
  const db = getDatabase();
  const { data: row, error } = await db
    .from('themes')
    .select('analytics_json')
    .eq('id', themeId)
    .maybeSingle();
  if (error) throw error;
  if (!row?.analytics_json) return null;
  try {
    const data = JSON.parse(row.analytics_json);
    if (data.title_analysis) {
      return { analysis: data.title_analysis, analyzed_at: data.analyzed_at };
    }
  } catch {}
  return null;
}

// 获取分析提示词数据（供 API 使用）
export async function getAnalysisPromptData(themeId: number, filter?: InsightFilter, promptId?: number): Promise<{ prompt?: string; error?: string }> {
  const topTitles = await getTopTitles(themeId, 50, filter);
  if (topTitles.length < 5) {
    return { error: '数据不足，请先抓取更多笔记' };
  }

  const titleList = topTitles.slice(0, 30).map((t: any, i: number) =>
    `${i + 1}. ${t.title} (赞:${t.like_count}, 藏:${t.collect_count}, 评:${t.comment_count})`
  ).join('\n');

  let prompt: string;
  if (promptId) {
    const customPrompt = await getPromptProfile(promptId);
    if (customPrompt) {
      prompt = customPrompt.system_prompt + '\n\n' + (customPrompt.user_template || '').replace('{{titles}}', titleList);
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
  const titleList = topTitles.slice(0, 15).map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n');

  const prompt = `作为小红书运营分析师，根据以下数据生成简短的趋势报告：

今日数据：新增${todayStats.newNotes}篇，点赞${todayStats.totalLikes}，收藏${todayStats.totalCollects}
昨日数据：新增${yesterdayStats.newNotes}篇，点赞${yesterdayStats.totalLikes}，收藏${yesterdayStats.totalCollects}
热门标签：${todayStats.topTags.map(t => t.tag).join('、') || '暂无'}

近期热门标题：
${titleList || '暂无数据'}

请用3-4句话总结：1)数据变化趋势 2)内容热点方向 3)创作建议
直接输出分析，不要输出思考过程。`;

  return { prompt, stats: todayStats };
}

// 获取最新趋势报告
export async function getLatestTrendReport(themeId: number): Promise<{ stats: TrendStats; analysis: string; report_date: string } | null> {
  const db = getDatabase();
  const { data: row, error } = await db
    .from('trend_reports')
    .select('stats_json, analysis, report_date')
    .eq('theme_id', themeId)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  return {
    stats: JSON.parse(row.stats_json),
    analysis: row.analysis,
    report_date: row.report_date
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

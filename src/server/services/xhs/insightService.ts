import { getDatabase } from '../../db';
import { getSettings } from '../../settings';

export interface InsightFilter {
  days?: number;        // 时间范围：7/30/0(全部)
  sortBy?: 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';
}

// 停用词列表
const STOP_WORDS = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '什么', '怎么', '为什么', '可以', '这个', '那个', '还是', '但是', '如果', '因为', '所以', '然后', '或者', '而且', '虽然', '不过', '只是', '已经', '一直', '还有', '真的', '其实', '感觉', '觉得', '知道', '应该', '可能', '需要', '希望', '喜欢', '想要', '开始', '时候', '现在', '今天', '明天', '昨天']);

// 从标题和正文中提取标签，支持互动加权
function extractTags(rows: { title: string; desc?: string | null; like_count: number; collect_count: number }[]): { tag: string; count: number; weight: number }[] {
  const tagData: Record<string, { count: number; weight: number }> = {};
  // 匹配显式的 #标签（中文/英文/数字，2-20字符），标签后可能是空格、tab、换行或另一个#
  const hashtagPattern = /[#＃]([\u4e00-\u9fa5a-zA-Z0-9]+)/g;

  for (const row of rows) {
    const engagement = row.like_count + row.collect_count * 2;
    const seen = new Set<string>();

    // 只从正文中提取显式 #标签
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
    .sort((a, b) => b[1].weight - a[1].weight)  // 按互动加权排序
    .slice(0, 20)
    .map(([tag, d]) => ({ tag: `#${tag}`, count: d.count, weight: d.weight }));
}

function buildTimeFilter(days?: number): string {
  if (!days || days <= 0) return '';
  return `AND created_at >= datetime('now', '-${days} days')`;
}

function buildOrderBy(sortBy?: string): string {
  switch (sortBy) {
    case 'likes': return 'ORDER BY like_count DESC';
    case 'collects': return 'ORDER BY collect_count DESC';
    case 'comments': return 'ORDER BY comment_count DESC';
    case 'recent': return 'ORDER BY created_at DESC';
    default: return 'ORDER BY (like_count + collect_count * 2 + comment_count * 3) DESC';
  }
}

export function getTopTitles(themeId: number, limit = 50, filter?: InsightFilter) {
  const db = getDatabase();
  const timeFilter = buildTimeFilter(filter?.days);
  const orderBy = buildOrderBy(filter?.sortBy);
  return db.prepare(
    `SELECT title, like_count, collect_count, comment_count, created_at
     FROM topics WHERE theme_id = ? ${timeFilter}
     ${orderBy} LIMIT ?`
  ).all(themeId, limit) as { title: string; like_count: number; collect_count: number; comment_count: number; created_at: string }[];
}

export function getTagStats(themeId: number, filter?: InsightFilter) {
  const db = getDatabase();
  const timeFilter = buildTimeFilter(filter?.days);
  const rows = db.prepare(
    `SELECT title, desc, like_count, collect_count FROM topics WHERE theme_id = ? ${timeFilter}`
  ).all(themeId) as { title: string; desc?: string | null; like_count: number; collect_count: number }[];
  return extractTags(rows);
}

// 清理LLM返回内容（移除thinking标签等）
function cleanLLMResponse(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

export async function analyzeTitlePatterns(themeId: number, filter?: InsightFilter): Promise<string> {
  const settings = getSettings();
  if (!settings.llmBaseUrl || !settings.llmApiKey || !settings.llmModel) return '请先配置LLM API';

  const topTitles = getTopTitles(themeId, 50, filter);
  if (topTitles.length < 5) return '数据不足，请先抓取更多笔记';

  const titleList = topTitles.slice(0, 30).map((t, i) =>
    `${i + 1}. ${t.title} (赞:${t.like_count}, 藏:${t.collect_count}, 评:${t.comment_count})`
  ).join('\n');

  const prompt = `分析以下小红书爆款笔记标题的共同特点，总结3-5条爆款标题公式：\n\n${titleList}\n\n请用简洁的中文回答，每条公式用一行，格式如：\n1. 公式名称：具体说明\n\n注意：直接输出分析结果，不要输出思考过程。`;

  try {
    const res = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.llmApiKey}` },
      body: JSON.stringify({ model: settings.llmModel, messages: [{ role: 'user', content: prompt }], max_tokens: 500 })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '分析失败';
    return cleanLLMResponse(content);
  } catch (e) {
    return '分析失败: ' + (e as Error).message;
  }
}

export function getThemeStats(themeId: number, filter?: InsightFilter) {
  const db = getDatabase();
  const timeFilter = buildTimeFilter(filter?.days);
  const row = db.prepare(
    `SELECT COUNT(*) as totalNotes,
            COALESCE(SUM(like_count), 0) as totalLikes,
            COALESCE(SUM(collect_count), 0) as totalCollects,
            COALESCE(AVG(like_count + collect_count * 2), 0) as avgEngagement
     FROM topics WHERE theme_id = ? ${timeFilter}`
  ).get(themeId) as { totalNotes: number; totalLikes: number; totalCollects: number; avgEngagement: number };
  return row;
}

export function getInsightData(themeId: number, filter?: InsightFilter) {
  const tags = getTagStats(themeId, filter);
  const topTitles = getTopTitles(themeId, 10, filter);
  const stats = getThemeStats(themeId, filter);
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
function getDayStats(themeId: number, date: string): TrendStats {
  const db = getDatabase();
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const rows = db.prepare(
    `SELECT title, like_count, collect_count, comment_count
     FROM topics WHERE theme_id = ? AND date(created_at) = ?`
  ).all(themeId, date) as { title: string; like_count: number; collect_count: number; comment_count: number }[];

  const totalLikes = rows.reduce((s, r) => s + (r.like_count || 0), 0);
  const totalCollects = rows.reduce((s, r) => s + (r.collect_count || 0), 0);
  const totalComments = rows.reduce((s, r) => s + (r.comment_count || 0), 0);
  const avgEngagement = rows.length > 0 ? Math.round((totalLikes + totalCollects * 2 + totalComments * 3) / rows.length) : 0;

  const tags = extractTags(rows.map(r => ({ title: r.title, like_count: r.like_count || 0, collect_count: r.collect_count || 0 })));

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

// 生成趋势报告（对比今天和昨天）
export async function generateTrendReport(themeId: number): Promise<{ stats: TrendStats; analysis: string }> {
  const today = getTodayDate();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const todayStats = getDayStats(themeId, today);
  const yesterdayStats = getDayStats(themeId, yesterdayStr);

  // 生成AI分析
  const settings = getSettings();
  let analysis = '';

  if (settings.llmBaseUrl && settings.llmApiKey && settings.llmModel) {
    const topTitles = getTopTitles(themeId, 20, { days: 7 });
    const titleList = topTitles.slice(0, 15).map((t, i) => `${i + 1}. ${t.title}`).join('\n');

    const prompt = `作为小红书运营分析师，根据以下数据生成简短的趋势报告：

今日数据：新增${todayStats.newNotes}篇，点赞${todayStats.totalLikes}，收藏${todayStats.totalCollects}
昨日数据：新增${yesterdayStats.newNotes}篇，点赞${yesterdayStats.totalLikes}，收藏${yesterdayStats.totalCollects}
热门标签：${todayStats.topTags.map(t => t.tag).join('、') || '暂无'}

近期热门标题：
${titleList || '暂无数据'}

请用3-4句话总结：1)数据变化趋势 2)内容热点方向 3)创作建议
直接输出分析，不要输出思考过程。`;

    try {
      const res = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.llmApiKey}` },
        body: JSON.stringify({ model: settings.llmModel, messages: [{ role: 'user', content: prompt }], max_tokens: 300 })
      });
      const data = await res.json();
      analysis = cleanLLMResponse(data.choices?.[0]?.message?.content || '');
    } catch (e) {
      analysis = '分析生成失败';
    }
  }

  // 保存报告到数据库
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO trend_reports (theme_id, report_date, stats_json, analysis, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(themeId, today, JSON.stringify(todayStats), analysis);

  return { stats: todayStats, analysis };
}

// 获取最新趋势报告
export function getLatestTrendReport(themeId: number): { stats: TrendStats; analysis: string; report_date: string } | null {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT stats_json, analysis, report_date FROM trend_reports
     WHERE theme_id = ? ORDER BY report_date DESC LIMIT 1`
  ).get(themeId) as { stats_json: string; analysis: string; report_date: string } | undefined;

  if (!row) return null;
  return {
    stats: JSON.parse(row.stats_json),
    analysis: row.analysis,
    report_date: row.report_date
  };
}

// 获取历史趋势数据（用于图表）
export function getTrendHistory(themeId: number, days = 7): TrendStats[] {
  const result: TrendStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push(getDayStats(themeId, date.toISOString().split('T')[0]));
  }
  return result;
}

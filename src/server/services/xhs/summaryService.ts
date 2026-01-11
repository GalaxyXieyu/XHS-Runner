import { getDatabase } from '../../db';

type TopicRow = {
  id: number;
  title: string;
  desc?: string | null;
  tags?: string | null;
  like_count?: number | null;
  collect_count?: number | null;
  comment_count?: number | null;
  created_at: string;
  note_id?: string | null;
};

export interface SummaryPayload {
  theme: string;
  goal: string;
  tags: string[];
  topTitles: string[];
  summaries: string[];
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function getEngagementScore(row: TopicRow) {
  const likes = row.like_count || 0;
  const collects = row.collect_count || 0;
  const comments = row.comment_count || 0;
  return likes + collects * 2 + comments * 3;
}

function getFreshnessScore(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 1;
  const daysAgo = Math.max(0, (Date.now() - created) / (1000 * 60 * 60 * 24));
  return 1 / (1 + daysAgo / 7);
}

function scoreTopic(row: TopicRow) {
  const engagement = getEngagementScore(row);
  const freshness = getFreshnessScore(row.created_at);
  const trendBoost = 1;
  return engagement * freshness * trendBoost;
}

function extractTags(row: TopicRow) {
  const tags = parseJson(row.tags || null);
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag));
  }
  const text = `${row.title || ''} ${row.desc || ''}`;
  const matches = text.match(/[#＃]([\u4e00-\u9fa5a-zA-Z0-9]+)/g) || [];
  return matches.map((tag) => tag.replace(/^[#＃]/, ''));
}

function buildTopTags(rows: TopicRow[], limit = 8) {
  const tagWeights = new Map<string, number>();
  rows.forEach((row) => {
    const weight = getEngagementScore(row);
    extractTags(row).forEach((tag) => {
      tagWeights.set(tag, (tagWeights.get(tag) || 0) + weight);
    });
  });
  return Array.from(tagWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => `#${tag}`);
}

function buildSummaries(rows: TopicRow[]) {
  return rows.slice(0, 3).map((row) => {
    const tags = extractTags(row);
    const angle = tags[0] ? `标签:${tags[0]}` : '通用角度';
    const reason = getFreshnessScore(row.created_at) > 0.6 ? '近期热度' : '高互动';
    return `${row.title} | ${angle} | ${reason}`;
  });
}

function dedupeTopics(rows: TopicRow[]) {
  const seen = new Set<string>();
  const output: TopicRow[] = [];
  for (const row of rows) {
    const key = row.note_id || row.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function clusterByPrimaryTag(rows: TopicRow[]) {
  const clusters = new Map<string, TopicRow[]>();
  rows.forEach((row) => {
    const tag = extractTags(row)[0] || 'misc';
    const bucket = clusters.get(tag) || [];
    bucket.push(row);
    clusters.set(tag, bucket);
  });
  return Array.from(clusters.entries()).map(([tag, items]) => ({ tag, items }));
}

export function getClusterSummaries(themeId: number, days = 7, goal = 'collects') {
  const db = getDatabase();
  const timeFilter = days > 0 ? `AND created_at >= datetime('now', '-${days} days')` : '';
  const rows = db.prepare(
    `SELECT id, note_id, title, desc, tags, like_count, collect_count, comment_count, created_at
     FROM topics
     WHERE theme_id = ? ${timeFilter}`
  ).all(themeId) as TopicRow[];

  const deduped = dedupeTopics(rows);
  const scored = deduped
    .map((row) => ({ row, score: scoreTopic(row) }))
    .sort((a, b) => b.score - a.score);

  const clusters = clusterByPrimaryTag(scored.map((entry) => entry.row));
  return clusters.map((cluster) => {
    const topRows = cluster.items
      .map((row) => ({ row, score: scoreTopic(row) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.row);
    return {
      tag: cluster.tag,
      summary: {
        theme: String(themeId),
        goal,
        tags: buildTopTags(topRows, 8),
        topTitles: topRows.slice(0, 5).map((row) => row.title),
        summaries: buildSummaries(topRows),
      },
    };
  });
}

export function getPrimaryClusterSummary(themeId: number, days = 7, goal = 'collects'): SummaryPayload | null {
  const summaries = getClusterSummaries(themeId, days, goal);
  if (summaries.length === 0) return null;
  return summaries[0].summary;
}

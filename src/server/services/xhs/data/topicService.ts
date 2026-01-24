import { db, schema } from '../../../db';
import { desc as descOrder, eq, sql } from 'drizzle-orm';
import { canTransition, getAllowedTransitions } from '../core/workflow';

export type SortBy = 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';

export async function listTopics(limit = 100) {
  const topics = schema.topics;

  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      source: topics.source,
      source_id: topics.sourceId,
      status: topics.status,
      created_at: topics.createdAt,
    })
    .from(topics)
    .orderBy(descOrder(topics.id))
    .limit(limit);

  return (rows || []).map((row: any) => ({
    ...row,
    allowedStatuses: getAllowedTransitions(row.status),
  }));
}

export async function listTopicsByTheme(
  themeId: number,
  limit = 50,
  offset = 0,
  sortBy: SortBy = 'engagement'
) {
  const topics = schema.topics;
  const keywords = schema.keywords;

  const orderByClause = (() => {
    switch (sortBy) {
      case 'likes':
        return descOrder(topics.likeCount);
      case 'collects':
        return descOrder(topics.collectCount);
      case 'comments':
        return descOrder(topics.commentCount);
      case 'recent':
        return descOrder(topics.publishedAt);
      case 'engagement':
      default:
        return sql`COALESCE(${topics.likeCount}, 0) + COALESCE(${topics.collectCount}, 0) DESC`;
    }
  })();

  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      url: topics.url,
      author_name: topics.authorName,
      author_avatar_url: topics.authorAvatarUrl,
      like_count: topics.likeCount,
      collect_count: topics.collectCount,
      comment_count: topics.commentCount,
      cover_url: topics.coverUrl,
      published_at: topics.publishedAt,
      status: topics.status,
      keyword: keywords.value,
    })
    .from(topics)
    .leftJoin(keywords, eq(topics.keywordId, keywords.id))
    .where(eq(topics.themeId, themeId))
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset);

  return (rows || []).map((row: any) => ({
    ...row,
    keyword: row.keyword || null,
  }));
}

export async function countTopicsByTheme(themeId: number) {
  const topics = schema.topics;
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topics)
    .where(eq(topics.themeId, themeId));
  return result[0]?.count || 0;
}

export async function listTopicsByKeyword(keywordId: number, limit = 50) {
  const topics = schema.topics;

  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      url: topics.url,
      author_name: topics.authorName,
      author_avatar_url: topics.authorAvatarUrl,
      like_count: topics.likeCount,
      collect_count: topics.collectCount,
      comment_count: topics.commentCount,
      cover_url: topics.coverUrl,
      published_at: topics.publishedAt,
      status: topics.status,
    })
    .from(topics)
    .where(eq(topics.keywordId, keywordId))
    .orderBy(descOrder(topics.likeCount))
    .limit(limit);

  return rows || [];
}

export async function updateTopicStatus(id: number, nextStatus: string) {
  const topics = schema.topics;

  const currentRows = await db
    .select({ status: topics.status })
    .from(topics)
    .where(eq(topics.id, id))
    .limit(1);

  const current = currentRows[0];
  if (!current) {
    throw new Error('Topic not found');
  }
  if (!canTransition(current.status as any, nextStatus)) {
    throw new Error(`Invalid transition from ${current.status} to ${nextStatus}`);
  }

  const updated = await db
    .update(topics)
    .set({ status: nextStatus })
    .where(eq(topics.id, id))
    .returning({ id: topics.id, status: topics.status });

  return updated[0];
}

export async function forceUpdateTopicStatus(id: number, nextStatus: string) {
  const topics = schema.topics;

  const updated = await db
    .update(topics)
    .set({ status: nextStatus })
    .where(eq(topics.id, id))
    .returning({ id: topics.id, status: topics.status });

  return updated[0];
}

/**
 * 评论同步服务
 * 从小红书笔记详情页同步评论到本地数据库
 */

import { db, schema } from '@/server/db';
import { and, asc, eq, gt } from 'drizzle-orm';

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

/**
 * 同步已发布笔记的评论
 * @param publishRecordId 可选，指定单个笔记；不指定则同步所有已发布笔记
 */
export async function syncCommentsForPublishedNotes(publishRecordId?: number): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  try {
    if (publishRecordId) {
      const records = await db
        .select()
        .from(schema.publishRecords)
        .where(
          and(
            eq(schema.publishRecords.id, publishRecordId),
            eq(schema.publishRecords.status, 'published')
          )
        );

      if (records.length === 0) {
        return { synced: 0, skipped: 0, errors: ['没有找到已发布的笔记'] };
      }

      for (const record of records) {
        if (!record.noteId || !record.xsecToken) {
          result.errors.push(`记录 ${record.id} 缺少 noteId 或 xsecToken`);
          continue;
        }

        try {
          const syncedCount = await syncCommentsForNote(record.id, record.noteId, record.xsecToken);
          result.synced += syncedCount;
        } catch (err: any) {
          result.errors.push(`同步记录 ${record.id} 失败: ${err.message}`);
        }
      }
    } else {
      const batchSize = 200;
      let lastId = 0;
      let hasAny = false;

      while (true) {
        const batch = await db
          .select()
          .from(schema.publishRecords)
          .where(
            and(
              eq(schema.publishRecords.status, 'published'),
              gt(schema.publishRecords.id, lastId)
            )
          )
          .orderBy(asc(schema.publishRecords.id))
          .limit(batchSize);

        if (batch.length === 0) break;
        hasAny = true;

        for (const record of batch) {
          if (!record.noteId || !record.xsecToken) {
            result.errors.push(`记录 ${record.id} 缺少 noteId 或 xsecToken`);
            continue;
          }

          try {
            const syncedCount = await syncCommentsForNote(record.id, record.noteId, record.xsecToken);
            result.synced += syncedCount;
          } catch (err: any) {
            result.errors.push(`同步记录 ${record.id} 失败: ${err.message}`);
          }
        }

        lastId = Number(batch[batch.length - 1].id);
      }

      if (!hasAny) {
        return { synced: 0, skipped: 0, errors: ['没有找到已发布的笔记'] };
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(`同步过程出错: ${error.message}`);
    return result;
  }
}

/**
 * 同步单个笔记的评论
 * 注意：这是一个占位实现，实际需要调用 FeedService.getFeedDetail 获取评论
 */
async function syncCommentsForNote(
  publishRecordId: number,
  noteId: string,
  xsecToken: string
): Promise<number> {
  // TODO: 实际实现需要：
  // 1. 调用 FeedService.getFeedDetail(noteId, xsecToken) 获取笔记详情
  // 2. 从详情中提取评论列表
  // 3. 遍历评论，插入或更新到 comments 表

  // 目前返回模拟数据，后续集成 FeedService
  console.log(`[CommentSync] 同步笔记 ${noteId} 的评论 (publishRecordId: ${publishRecordId})`);

  // 示例：模拟获取到的评论数据
  const mockComments = [
    // 实际实现时从 FeedService 获取
  ];

  let synced = 0;
  for (const comment of mockComments as any[]) {
    if (!comment.commentId) {
      continue;
    }

    const [inserted] = await db
      .insert(schema.comments)
      .values({
        publishRecordId,
        xhsCommentId: comment.commentId,
        authorId: comment.authorId,
        authorName: comment.authorName,
        authorAvatar: comment.authorAvatar,
        content: comment.content,
        xhsCreatedAt: comment.createdAt ? new Date(comment.createdAt) : null,
        replyStatus: 'pending',
      })
      .onConflictDoNothing({ target: schema.comments.xhsCommentId })
      .returning({ id: schema.comments.id });

    if (inserted) synced++;
  }

  return synced;
}

/**
 * 手动添加评论（用于测试或手动录入）
 */
export async function addComment(data: {
  publishRecordId: number;
  xhsCommentId?: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  xhsCreatedAt?: Date;
}) {
  const [comment] = await db
    .insert(schema.comments)
    .values({
      publishRecordId: data.publishRecordId,
      xhsCommentId: data.xhsCommentId || `manual_${Date.now()}`,
      authorId: data.authorId,
      authorName: data.authorName,
      authorAvatar: data.authorAvatar,
      content: data.content,
      xhsCreatedAt: data.xhsCreatedAt,
      replyStatus: 'pending',
    })
    .returning();

  return comment;
}

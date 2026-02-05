import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { desc, eq } from 'drizzle-orm';
import { parseNumberParam } from '@/server/utils/requestLimits';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { publishRecordId, replyStatus, limit = '50' } = req.query;
    const limitNum = parseNumberParam(limit, { defaultValue: 50, min: 1, max: 200 });

    // 查询评论，关联 publish_records 获取笔记标题
    let query = db
      .select({
        id: schema.comments.id,
        publishRecordId: schema.comments.publishRecordId,
        xhsCommentId: schema.comments.xhsCommentId,
        authorId: schema.comments.authorId,
        authorName: schema.comments.authorName,
        authorAvatar: schema.comments.authorAvatar,
        content: schema.comments.content,
        parentCommentId: schema.comments.parentCommentId,
        xhsCreatedAt: schema.comments.xhsCreatedAt,
        replyStatus: schema.comments.replyStatus,
        replyContent: schema.comments.replyContent,
        replySentAt: schema.comments.replySentAt,
        createdAt: schema.comments.createdAt,
        // 关联笔记标题
        noteTitle: schema.publishRecords.title,
      })
      .from(schema.comments)
      .leftJoin(schema.publishRecords, eq(schema.comments.publishRecordId, schema.publishRecords.id))
      .orderBy(desc(schema.comments.createdAt))
      .limit(limitNum)
      .$dynamic();

    // 筛选条件
    if (publishRecordId) {
      query = query.where(eq(schema.comments.publishRecordId, Number(publishRecordId)));
    }
    if (replyStatus && replyStatus !== 'all') {
      query = query.where(eq(schema.comments.replyStatus, String(replyStatus)));
    }

    const comments = await query;

    // 转换为前端格式
    const result = comments.map((c) => ({
      id: String(c.id),
      noteTitle: c.noteTitle || '未知笔记',
      author: c.authorName || '匿名用户',
      authorAvatar: c.authorAvatar,
      content: c.content,
      time: c.xhsCreatedAt?.toISOString() || c.createdAt?.toISOString() || '',
      replied: c.replyStatus === 'sent',
      replyStatus: c.replyStatus,
      replyContent: c.replyContent,
      publishRecordId: c.publishRecordId,
    }));

    return res.status(200).json({ comments: result });
  } catch (error: any) {
    console.error('Comments list error:', error);
    return res.status(500).json({ error: error.message });
  }
}

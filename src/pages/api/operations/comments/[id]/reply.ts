import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }

    // 1. 获取评论
    const [comment] = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .limit(1);

    if (!comment) {
      return res.status(404).json({ error: '评论不存在' });
    }

    // 2. 获取关联的发布记录（需要 noteId 和 xsecToken）
    if (!comment.publishRecordId) {
      return res.status(400).json({ error: '评论未关联发布记录' });
    }

    const [publishRecord] = await db
      .select()
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.id, comment.publishRecordId))
      .limit(1);

    if (!publishRecord || !publishRecord.noteId || !publishRecord.xsecToken) {
      return res.status(400).json({ error: '发布记录缺少 noteId 或 xsecToken' });
    }

    // 3. 更新评论状态为 draft（草稿）
    await db
      .update(schema.comments)
      .set({
        replyContent: content.trim(),
        replyStatus: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(schema.comments.id, id));

    // 4. TODO: 实际发送回复
    // 需要调用 FeedService.commentOnFeed(noteId, xsecToken, content)
    // 目前只保存草稿，发送功能待集成

    // 模拟发送成功
    await db
      .update(schema.comments)
      .set({
        replyStatus: 'sent',
        replySentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.comments.id, id));

    return res.status(200).json({
      success: true,
      message: '回复已保存',
      // 实际实现时返回发送结果
    });
  } catch (error: any) {
    console.error('Reply error:', error);
    return res.status(500).json({ error: error.message });
  }
}

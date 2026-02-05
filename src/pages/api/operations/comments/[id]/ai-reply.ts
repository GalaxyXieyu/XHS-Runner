import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { generateAIReply } from '@/server/services/xhs/operations/aiReplyService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  try {
    // 1. 获取评论
    const [comment] = await db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .limit(1);

    if (!comment) {
      return res.status(404).json({ error: '评论不存在' });
    }

    // 2. 获取关联的发布记录（获取笔记内容作为上下文）
    let noteContext = { title: '', content: '' };
    if (comment.publishRecordId) {
      const [publishRecord] = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.id, comment.publishRecordId))
        .limit(1);

      if (publishRecord) {
        noteContext = {
          title: publishRecord.title || '',
          content: publishRecord.content || '',
        };
      }
    }

    // 3. 生成 AI 回复
    const aiReply = await generateAIReply({
      commentContent: comment.content,
      commentAuthor: comment.authorName || '用户',
      noteTitle: noteContext.title,
      noteContent: noteContext.content,
    });

    // 4. 保存为草稿
    await db
      .update(schema.comments)
      .set({
        replyContent: aiReply,
        replyStatus: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(schema.comments.id, id));

    return res.status(200).json({
      success: true,
      reply: aiReply,
      message: 'AI 回复已生成，请确认后发送',
    });
  } catch (error: any) {
    console.error('AI reply error:', error);
    return res.status(500).json({ error: error.message });
  }
}

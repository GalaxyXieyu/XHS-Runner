import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/server/db';
import { conversations, conversationMessages } from '@/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  try {
    // GET: 获取对话详情（含所有消息）
    if (req.method === 'GET') {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // 获取所有消息
      const messages = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, id))
        .orderBy(asc(conversationMessages.createdAt));

      return res.status(200).json({
        ...conversation,
        messages,
      });
    }

    // PUT: 更新对话
    if (req.method === 'PUT') {
      const { title, status, creativeId, metadata } = req.body;

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) updateData.title = title;
      if (status !== undefined) updateData.status = status;
      if (creativeId !== undefined) updateData.creativeId = creativeId;
      if (metadata !== undefined) updateData.metadata = metadata;

      const [updated] = await db
        .update(conversations)
        .set(updateData)
        .where(eq(conversations.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      return res.status(200).json(updated);
    }

    // DELETE: 删除对话
    if (req.method === 'DELETE') {
      const [deleted] = await db
        .delete(conversations)
        .where(eq(conversations.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Conversation API error:', error);
    res.status(500).json({ error: error.message });
  }
}

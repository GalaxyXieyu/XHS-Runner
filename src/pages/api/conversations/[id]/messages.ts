import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/server/db';
import { conversations, conversationMessages } from '@/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const conversationId = Number(req.query.id);
  if (!conversationId || isNaN(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  try {
    // GET: 获取对话消息列表
    if (req.method === 'GET') {
      const messages = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.createdAt));

      return res.status(200).json(messages);
    }

    // POST: 追加消息
    if (req.method === 'POST') {
      const { role, content, agent, askUser, askUserResponse, events } = req.body;

      if (!role || !content) {
        return res.status(400).json({ error: 'role and content are required' });
      }

      // 验证对话存在
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // 插入消息
      const [message] = await db
        .insert(conversationMessages)
        .values({
          conversationId,
          role,
          content,
          agent: agent || null,
          askUser: askUser || null,
          askUserResponse: askUserResponse || null,
          events: events || null,
        })
        .returning();

      // 更新对话的 updatedAt
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      return res.status(201).json(message);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Conversation messages API error:', error);
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/server/db';
import { conversations, conversationMessages } from '@/server/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // GET: 获取对话列表
    if (req.method === 'GET') {
      const { themeId, status, limit = '20', offset = '0' } = req.query;

      const conditions = [];
      if (themeId) {
        conditions.push(eq(conversations.themeId, Number(themeId)));
      }
      if (status) {
        conditions.push(eq(conversations.status, String(status)));
      }

      const result = await db
        .select()
        .from(conversations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(conversations.updatedAt))
        .limit(Number(limit))
        .offset(Number(offset));

      return res.status(200).json(result);
    }

    // POST: 创建新对话
    if (req.method === 'POST') {
      const { themeId, threadId, title, metadata } = req.body;

      if (!threadId) {
        return res.status(400).json({ error: 'threadId is required' });
      }

      const [conversation] = await db
        .insert(conversations)
        .values({
          themeId: themeId ? Number(themeId) : null,
          threadId,
          title: title || null,
          metadata: metadata || null,
          status: 'active',
        })
        .returning();

      return res.status(201).json(conversation);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Conversation API error:', error);
    res.status(500).json({ error: error.message });
  }
}

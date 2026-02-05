import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { desc, eq, or, inArray } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { themeId, status } = req.query;

    // 查询发布队列，关联 creatives 获取封面
    const records = await db
      .select({
        id: schema.publishRecords.id,
        title: schema.publishRecords.title,
        status: schema.publishRecords.status,
        scheduledAt: schema.publishRecords.scheduledAt,
        createdAt: schema.publishRecords.createdAt,
        creativeId: schema.publishRecords.creativeId,
        themeId: schema.publishRecords.themeId,
        errorMessage: schema.publishRecords.errorMessage,
        // creative 封面
        creativeCoverStyle: schema.creatives.coverStyle,
      })
      .from(schema.publishRecords)
      .leftJoin(schema.creatives, eq(schema.publishRecords.creativeId, schema.creatives.id))
      .where(
        status
          ? eq(schema.publishRecords.status, String(status))
          : inArray(schema.publishRecords.status, ['queued', 'pending', 'running'])
      )
      .orderBy(desc(schema.publishRecords.createdAt))
      .limit(50);

    // 转换为前端格式
    const queue = records.map((r) => ({
      id: String(r.id),
      title: r.title || '未命名',
      thumbnail: r.creativeCoverStyle || '',
      scheduledTime: r.scheduledAt?.toISOString() || r.createdAt?.toISOString() || '',
      status: r.status as 'pending' | 'queued' | 'running' | 'published' | 'failed',
      creativeId: r.creativeId,
      themeId: r.themeId,
      errorMessage: r.errorMessage,
    }));

    return res.status(200).json({ queue });
  } catch (error: any) {
    console.error('Queue list error:', error);
    return res.status(500).json({ error: error.message });
  }
}

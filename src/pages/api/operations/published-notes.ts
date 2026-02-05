import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { desc, eq, and } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { themeId, limit = '20' } = req.query;

    // 构建 where 条件
    const conditions = [eq(schema.publishRecords.status, 'published')];
    if (themeId) {
      conditions.push(eq(schema.publishRecords.themeId, Number(themeId)));
    }

    // 查询已发布的笔记
    const publishedNotes = await db
      .select({
        id: schema.publishRecords.id,
        noteId: schema.publishRecords.noteId,
        title: schema.publishRecords.title,
        publishedAt: schema.publishRecords.publishedAt,
        themeId: schema.publishRecords.themeId,
        creativeId: schema.publishRecords.creativeId,
      })
      .from(schema.publishRecords)
      .where(and(...conditions))
      .orderBy(desc(schema.publishRecords.publishedAt))
      .limit(Number(limit));

    // 为每个笔记获取最新指标
    const notesWithMetrics = await Promise.all(
      publishedNotes.map(async (note) => {
        // 获取该笔记的所有指标（最新一条）
        const metrics = await db
          .select({
            metricKey: schema.metrics.metricKey,
            metricValue: schema.metrics.metricValue,
            capturedAt: schema.metrics.capturedAt,
          })
          .from(schema.metrics)
          .where(eq(schema.metrics.publishRecordId, note.id))
          .orderBy(desc(schema.metrics.capturedAt));

        // 按 metricKey 去重，只保留最新的
        const latestMetrics: Record<string, number> = {};
        const seenKeys = new Set<string>();
        for (const m of metrics) {
          if (!seenKeys.has(m.metricKey)) {
            latestMetrics[m.metricKey] = Number(m.metricValue);
            seenKeys.add(m.metricKey);
          }
        }

        // 计算趋势（简单判断：比较最近两次采集）
        let trend: 'up' | 'down' | 'stable' = 'stable';
        const likeMetrics = metrics.filter((m) => m.metricKey === 'likes');
        if (likeMetrics.length >= 2) {
          const latest = Number(likeMetrics[0].metricValue);
          const previous = Number(likeMetrics[1].metricValue);
          if (latest > previous) trend = 'up';
          else if (latest < previous) trend = 'down';
        }

        return {
          id: String(note.id),
          noteId: note.noteId,
          title: note.title || '未命名',
          publishTime: note.publishedAt?.toISOString() || '',
          views: latestMetrics['views'] || 0,
          likes: latestMetrics['likes'] || 0,
          comments: latestMetrics['comments'] || 0,
          collects: latestMetrics['collects'] || 0,
          trend,
          shouldDelete: false, // 可以基于指标判断是否建议删除
        };
      })
    );

    return res.status(200).json({ notes: notesWithMetrics });
  } catch (error: any) {
    console.error('Published notes error:', error);
    return res.status(500).json({ error: error.message });
  }
}

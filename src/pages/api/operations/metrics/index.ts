import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { parseNumberParam } from '@/server/utils/requestLimits';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { days = '7', publishRecordId } = req.query;
    const daysNum = parseNumberParam(days, { defaultValue: 7, min: 1, max: 90 });

    // 计算时间范围
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // 如果指定了 publishRecordId，返回该笔记的指标历史
    if (publishRecordId) {
      const metrics = await db
        .select()
        .from(schema.metrics)
        .where(eq(schema.metrics.publishRecordId, Number(publishRecordId)))
        .orderBy(desc(schema.metrics.capturedAt));

      return res.status(200).json({ metrics });
    }

    // 否则返回汇总统计
    // 1. 总发布数
    const [publishedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.status, 'published'));

    // 2. 待发布数
    const [queuedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.status, 'queued'));

    // 3. 待回复评论数
    const [pendingReplies] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.comments)
      .where(eq(schema.comments.replyStatus, 'pending'));

    // 4. 最近指标趋势（按天分组）
    const trendData = await db
      .select({
        date: sql<string>`DATE(captured_at)`.as('date'),
        metricKey: schema.metrics.metricKey,
        total: sql<number>`SUM(metric_value)`.as('total'),
      })
      .from(schema.metrics)
      .where(gte(schema.metrics.capturedAt, startDate))
      .groupBy(sql`DATE(captured_at)`, schema.metrics.metricKey)
      .orderBy(sql`DATE(captured_at)`);

    // 5. 汇总最新指标
    const latestMetrics = await db
      .select({
        metricKey: schema.metrics.metricKey,
        total: sql<number>`SUM(metric_value)`.as('total'),
      })
      .from(schema.metrics)
      .groupBy(schema.metrics.metricKey);

    // 转换为前端需要的格式
    const summary = {
      published: Number(publishedCount?.count || 0),
      queued: Number(queuedCount?.count || 0),
      pendingReplies: Number(pendingReplies?.count || 0),
      metrics: latestMetrics.reduce(
        (acc, m) => {
          acc[m.metricKey] = Number(m.total || 0);
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    // 构建趋势数据
    const trend: Record<string, { date: string; value: number }[]> = {};
    for (const item of trendData) {
      if (!trend[item.metricKey]) {
        trend[item.metricKey] = [];
      }
      trend[item.metricKey].push({
        date: item.date,
        value: Number(item.total || 0),
      });
    }

    return res.status(200).json({
      summary,
      trend,
      period: { days: daysNum, startDate: startDate.toISOString() },
    });
  } catch (error: any) {
    console.error('Metrics error:', error);
    return res.status(500).json({ error: error.message });
  }
}

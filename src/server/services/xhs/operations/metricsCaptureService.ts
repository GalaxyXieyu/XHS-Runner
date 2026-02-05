/**
 * 指标采集服务
 * 采集已发布笔记的互动数据（点赞、收藏、评论数等）
 */

import { db, schema } from '@/server/db';
import { and, asc, eq, gt } from 'drizzle-orm';

export interface CaptureResult {
  captured: number;
  errors: string[];
}

/**
 * 采集已发布笔记的指标
 * @param publishRecordId 可选，指定单个笔记；不指定则采集所有已发布笔记
 */
export async function captureMetricsForPublishedNotes(publishRecordId?: number): Promise<CaptureResult> {
  const result: CaptureResult = { captured: 0, errors: [] };

  try {
    if (publishRecordId) {
      const records = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.id, publishRecordId));

      if (records.length === 0) {
        return { captured: 0, errors: ['没有找到已发布的笔记'] };
      }

      for (const record of records) {
        if (!record.noteId) {
          result.errors.push(`记录 ${record.id} 缺少 noteId`);
          continue;
        }

        try {
          await captureMetricsForNote(record.id, record.noteId);
          result.captured++;
        } catch (err: any) {
          result.errors.push(`采集记录 ${record.id} 失败: ${err.message}`);
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
          if (!record.noteId) {
            result.errors.push(`记录 ${record.id} 缺少 noteId`);
            continue;
          }

          try {
            await captureMetricsForNote(record.id, record.noteId);
            result.captured++;
          } catch (err: any) {
            result.errors.push(`采集记录 ${record.id} 失败: ${err.message}`);
          }
        }

        lastId = Number(batch[batch.length - 1].id);
      }

      if (!hasAny) {
        return { captured: 0, errors: ['没有找到已发布的笔记'] };
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(`采集过程出错: ${error.message}`);
    return result;
  }
}

/**
 * 采集单个笔记的指标
 * 注意：这是一个占位实现，实际需要调用 XHS API 获取真实数据
 */
async function captureMetricsForNote(publishRecordId: number, noteId: string): Promise<void> {
  // TODO: 实际实现需要：
  // 1. 调用 NoteService.getUserNotes() 获取用户笔记列表
  // 2. 或者调用 FeedService.getFeedDetail() 获取单篇详情
  // 3. 提取 likeCount, collectCount, commentCount 等指标

  console.log(`[MetricsCapture] 采集笔记 ${noteId} 的指标 (publishRecordId: ${publishRecordId})`);

  // 模拟采集到的指标数据
  // 实际实现时从 XHS API 获取
  const mockMetrics = {
    views: Math.floor(Math.random() * 1000),
    likes: Math.floor(Math.random() * 100),
    collects: Math.floor(Math.random() * 50),
    comments: Math.floor(Math.random() * 20),
  };

  const now = new Date();

  const rows = Object.entries(mockMetrics).map(([key, value]) => ({
    publishRecordId,
    metricKey: key,
    metricValue: value,
    capturedAt: now,
  }));

  await db.insert(schema.metrics).values(rows);
}

/**
 * 记录单个指标
 */
export async function recordMetric(
  publishRecordId: number,
  metricKey: string,
  metricValue: number
): Promise<void> {
  await db.insert(schema.metrics).values({
    publishRecordId,
    metricKey,
    metricValue,
    capturedAt: new Date(),
  });
}

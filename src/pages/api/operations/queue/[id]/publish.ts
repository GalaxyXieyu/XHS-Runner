import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { processPublishRecordById } from '@/server/services/xhs/publish/publishQueue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    // 1. 获取记录
    const [record] = await db
      .select()
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.id, id))
      .limit(1);

    if (!record) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (record.status === 'published') {
      return res.status(400).json({ error: '该记录已发布' });
    }

    if (record.status === 'running') {
      return res.status(400).json({ error: '该记录正在发布中' });
    }

    // 2. 立即处理指定记录（原子锁定并发布）
    const result = await processPublishRecordById(id);

    if (!result.processed) {
      const reason = 'reason' in result ? result.reason : 'empty';
      const status = 'status' in result ? result.status : null;

      if (reason === 'not-found') {
        return res.status(404).json({ error: 'Not found' });
      }
      if (reason === 'not-eligible') {
        if (status === 'running') {
          return res.status(400).json({ error: '该记录正在发布中' });
        }
        if (status === 'published') {
          return res.status(400).json({ error: '该记录已发布' });
        }
        return res.status(400).json({ error: '该记录状态不允许发布: ' + (status || 'unknown') });
      }
      return res.status(400).json({ error: '队列为空' });
    }

    return res.status(200).json({
      success: true,
      result,
      message: result.success ? '发布处理完成' : '发布失败',
    });
  } catch (error: any) {
    console.error('Publish error:', error);
    return res.status(500).json({ error: error.message });
  }
}

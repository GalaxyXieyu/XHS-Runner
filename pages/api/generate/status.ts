import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '../_init';
import { getDatabase } from '../../../src/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { getQueueStats } = await getService(
      'generationQueue',
      () => import('../../../src/server/services/xhs/generationQueue')
    );

    const taskId = req.query.taskId ? Number(req.query.taskId) : null;

    // 如果指定了 taskId，查询单个任务状态
    if (taskId) {
      const db = getDatabase();
      const { data: task, error } = await db
        .from('generation_tasks')
        .select('id, topic_id, status, prompt, model, result_asset_id, created_at, updated_at')
        .eq('id', taskId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // 计算进度
      const progress = task.status === 'done' ? 100 :
                       task.status === 'failed' ? 0 :
                       task.status === 'generating' ? 75 :
                       task.status === 'queued' ? 25 : 0;

      return res.json({
        id: task.id,
        topicId: task.topic_id,
        status: task.status,
        prompt: task.prompt,
        model: task.model,
        resultAssetId: task.result_asset_id,
        progress,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      });
    }

    // 否则返回队列统计
    const stats = getQueueStats();
    return res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

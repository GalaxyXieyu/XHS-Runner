import type { NextApiRequest, NextApiResponse } from 'next';
import { getStatus } from '@/server/services/xhs/llm/generationQueue';
import { supabase } from '@/server/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const taskId = req.query.taskId ? Number(req.query.taskId) : null;

    if (taskId) {
      const { data: task, error } = await supabase
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

      const status = String(task.status || 'queued');
      const progress =
        status === 'done' ? 100 :
        status === 'failed' ? 0 :
        status === 'generating' ? 75 :
        status === 'queued' ? 25 : 0;

      return res.json({
        id: task.id,
        topicId: task.topic_id,
        status,
        prompt: task.prompt,
        model: task.model,
        resultAssetId: task.result_asset_id,
        progress,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      });
    }

    const stats = getStatus();
    return res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

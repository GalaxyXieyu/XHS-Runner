import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager } from '@/server/services/task';
import { getDatabase } from '@/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const taskId = Number(req.query.taskId);
  if (!Number.isFinite(taskId)) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  if (req.method === 'GET') {
    try {
      const status = await taskManager.getTaskStatus(taskId);
      if (!status) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.status(200).json(status);
    } catch (error: any) {
      console.error('[tasks] status failed:', error);
      return res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const db = getDatabase();
      // 只删除 generation_tasks 记录，不删除关联的 creative
      const { error } = await db.from('generation_tasks').delete().eq('id', taskId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[tasks] delete failed:', error);
      return res.status(500).json({ error: error?.message || '删除失败' });
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

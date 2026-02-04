import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager } from '@/server/services/task';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const taskId = Number(req.query.taskId);
  if (!Number.isFinite(taskId)) {
    return res.status(400).json({ error: 'taskId is required' });
  }

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

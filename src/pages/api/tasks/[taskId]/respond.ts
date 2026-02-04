import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager } from '@/server/services/task';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const taskId = Number(req.query.taskId);
  if (!Number.isFinite(taskId)) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  const { action, selectedIds, customInput, modifiedData } = req.body || {};

  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }

  try {
    const result = await taskManager.respondToTask(taskId, {
      action,
      selectedIds: Array.isArray(selectedIds) ? selectedIds : undefined,
      customInput: customInput ? String(customInput) : undefined,
      modifiedData,
    });

    return res.status(200).json({ success: true, status: result.status });
  } catch (error: any) {
    console.error('[tasks] respond failed:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}

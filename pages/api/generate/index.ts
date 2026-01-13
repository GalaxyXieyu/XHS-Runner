import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '../_init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { enqueueTask } = await getService(
      'generationQueue',
      () => import('../../../src/server/services/xhs/generationQueue')
    );

    const { prompt, model, topicId, templateKey } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const task = await enqueueTask({
      prompt,
      model: model || 'jimeng',
      topicId,
      templateKey,
    });

    return res.status(201).json({ taskId: task.id, prompt: task.prompt, status: 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { enqueueGeneration } from '@/server/services/xhs/llm/generationQueue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, model, topicId, templateKey } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const task = await enqueueGeneration({
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

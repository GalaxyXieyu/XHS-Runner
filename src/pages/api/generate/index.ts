import type { NextApiRequest, NextApiResponse } from 'next';
import { enqueueBatch, enqueueGeneration } from '@/server/services/xhs/llm/generationQueue';
import { ensureInit } from '@/server/nextApi/init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureInit();

    const { prompt, model, topicId, themeId, templateKey, count, outputCount } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const normalizedThemeId = themeId !== undefined && themeId !== null ? Number(themeId) : undefined;
    const normalizedTopicId = topicId !== undefined && topicId !== null ? Number(topicId) : undefined;
    const normalizedCountRaw = count ?? outputCount ?? 1;
    const normalizedCount = Math.min(10, Math.max(1, Number(normalizedCountRaw) || 1));

    if (normalizedCount > 1) {
      const tasks = await enqueueBatch(
        Array.from({ length: normalizedCount }, () => ({
          prompt,
          model: model || 'jimeng',
          themeId: normalizedThemeId,
          topicId: normalizedTopicId,
          templateKey,
        }))
      );

      return res.status(201).json({
        taskId: tasks[0]?.id,
        taskIds: tasks.map((t) => t.id),
        prompt: tasks[0]?.prompt,
        status: 'queued',
      });
    }

    const task = await enqueueGeneration({
      prompt,
      model: model || 'jimeng',
      themeId: normalizedThemeId,
      topicId: normalizedTopicId,
      templateKey,
    });

    return res.status(201).json({ taskId: task.id, taskIds: [task.id], prompt: task.prompt, status: 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

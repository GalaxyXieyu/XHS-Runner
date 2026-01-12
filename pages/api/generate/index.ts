import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import os from 'os';

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { setUserDataPath } = await import('../../../src/server/runtime/userDataPath');
  const { initializeDatabase } = await import('../../../src/server/db');
  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);
  initializeDatabase();
  initialized = true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureInit();
    const { enqueueTask } = await import('../../../src/server/services/xhs/generationQueue');

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

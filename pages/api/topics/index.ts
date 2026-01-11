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
  try {
    await ensureInit();
    const { listTopics, listTopicsByTheme, listTopicsByKeyword } = await import(
      '../../../src/server/services/xhs/topicService'
    );

    if (req.method === 'GET') {
      const { themeId, keywordId, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 50;

      if (themeId) {
        const topics = listTopicsByTheme(parseInt(themeId as string, 10), limitNum);
        return res.status(200).json(topics);
      }
      if (keywordId) {
        const topics = listTopicsByKeyword(parseInt(keywordId as string, 10), limitNum);
        return res.status(200).json(topics);
      }
      const topics = listTopics(limitNum);
      return res.status(200).json(topics);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Topics API error:', error);
    res.status(500).json({ error: error.message });
  }
}

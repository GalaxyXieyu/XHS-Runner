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
    const { generateTrendReport, getLatestTrendReport, getTrendHistory } = await import('../../../src/server/services/xhs/insightService');
    
    const { themeId } = req.query;
    if (!themeId) return res.status(400).json({ error: 'themeId required' });
    const id = parseInt(themeId as string, 10);

    if (req.method === 'GET') {
      // 获取最新报告和历史数据
      const latest = getLatestTrendReport(id);
      const history = getTrendHistory(id, 7);
      return res.status(200).json({ latest, history });
    }

    if (req.method === 'POST') {
      // 生成新报告
      const report = await generateTrendReport(id);
      return res.status(200).json(report);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

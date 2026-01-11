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
    const { getInsightData } = await import('../../../src/server/services/xhs/insightService');
    
    if (req.method === 'GET') {
      const { themeId, days, sortBy } = req.query;
      if (!themeId) return res.status(400).json({ error: 'themeId required' });
      const filter = {
        days: days ? parseInt(days as string, 10) : undefined,
        sortBy: sortBy as any
      };
      const data = getInsightData(parseInt(themeId as string, 10), filter);
      return res.status(200).json(data);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

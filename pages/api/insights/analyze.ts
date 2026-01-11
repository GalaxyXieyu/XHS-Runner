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
    const { analyzeTitlePatterns } = await import('../../../src/server/services/xhs/insightService');
    
    if (req.method === 'POST') {
      const { themeId, days, sortBy } = req.body;
      if (!themeId) return res.status(400).json({ error: 'themeId required' });
      const filter = { days, sortBy };
      const analysis = await analyzeTitlePatterns(themeId, filter);
      return res.status(200).json({ analysis });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

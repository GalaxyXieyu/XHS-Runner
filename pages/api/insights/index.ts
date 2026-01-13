import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '../_init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { getInsightData } = await getService('insightService', () => import('../../../src/server/services/xhs/insightService'));

    if (req.method === 'GET') {
      const { themeId, days, sortBy } = req.query;
      if (!themeId) return res.status(400).json({ error: 'themeId required' });
      const filter = {
        days: days ? parseInt(days as string, 10) : undefined,
        sortBy: sortBy as any
      };
      const data = await getInsightData(parseInt(themeId as string, 10), filter);
      return res.status(200).json(data);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

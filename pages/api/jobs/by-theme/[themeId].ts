// GET /api/jobs/by-theme/[themeId]
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSchedulerModule } from '../_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const mod = await getSchedulerModule();
    const themeId = Number(req.query.themeId);
    const job = mod.getJobByTheme(themeId);
    return res.status(200).json(job);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

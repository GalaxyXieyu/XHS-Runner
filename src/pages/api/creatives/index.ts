import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getCreativeService() {
  return getService('creativeService', () => import('@/server/services/xhs/data/creativeService'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getCreativeService();
    if (req.method === 'GET') {
      const themeId = req.query.themeId ? Number(req.query.themeId) : undefined;
      const creatives = await svc.listCreatives(themeId);
      return res.status(200).json(creatives);
    }
    if (req.method === 'POST') {
      const creative = await svc.createCreative(req.body);
      return res.status(201).json(creative);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';
import { getContentPackage } from '@/server/services/xhs/content/creativeService';

async function getCreativeService() {
  return getService('creativeService', () => import('@/server/services/xhs/data/creativeService'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    if (req.method === 'GET') {
      const pkg = await getContentPackage(id);
      if (!pkg) return res.status(404).json({ error: 'Creative not found' });
      return res.status(200).json(pkg);
    }
    const svc = await getCreativeService();
    if (req.method === 'PUT') {
      const creative = await svc.updateCreative({ id, ...req.body });
      return res.status(200).json(creative);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

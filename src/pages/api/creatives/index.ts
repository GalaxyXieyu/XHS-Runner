import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';
import { listContentPackages } from '@/server/services/xhs/content/creativeService';

async function getCreativeService() {
  return getService('creativeService', () => import('@/server/services/xhs/data/creativeService'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getCreativeService();
    if (req.method === 'GET') {
      const { themeId, status, limit, offset, withAssets } = req.query;

      // 如果请求包含 assets，返回完整的 ContentPackage
      if (withAssets === 'true') {
        const packages = await listContentPackages({
          status: status as string | undefined,
          themeId: themeId ? Number(themeId) : undefined,
          limit: limit ? Number(limit) : 20,
          offset: offset ? Number(offset) : 0,
        });
        return res.status(200).json(packages);
      }

      const creatives = await svc.listCreatives(themeId ? Number(themeId) : undefined);
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

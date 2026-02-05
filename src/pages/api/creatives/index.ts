import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';
import { listContentPackages } from '@/server/services/xhs/content/creativeService';

async function getCreativeService() {
  return getService('creativeService', () => import('@/server/services/xhs/data/creativeService'));
}

// 转换 ContentPackage 为前端期望的格式
function transformContentPackage(pkg: any) {
  const images = pkg.assets.map((asset: any) => `/api/assets/${asset.id}`);
  return {
    id: String(pkg.creative.id),
    titles: [pkg.creative.title],
    selectedTitleIndex: 0,
    content: pkg.creative.content || '',
    tags: pkg.creative.tags ? pkg.creative.tags.split(',').filter(Boolean) : [],
    coverImage: images[0] || undefined,
    images,
    qualityScore: 0,
    predictedMetrics: {
      likes: 0,
      collects: 0,
      comments: 0,
    },
    status: pkg.creative.status,
    createdAt: pkg.creative.createdAt,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getCreativeService();
    if (req.method === 'GET') {
      const { themeId, status, limit, offset, withAssets } = req.query;

      // 如果请求包含 assets，返回完整的 ContentPackage
      if (withAssets === 'true') {
        const excludeStatuses = status ? undefined : ['processing', 'aborted', 'failed'];
        const packages = await listContentPackages({
          status: status as string | undefined,
          excludeStatuses,
          themeId: themeId ? Number(themeId) : undefined,
          limit: limit ? Number(limit) : 20,
          offset: offset ? Number(offset) : 0,
        });
        // 转换为前端期望的格式
        const transformed = packages.map(transformContentPackage);
        return res.status(200).json(transformed);
      }

      const creatives = await svc.listCreatives(themeId ? Number(themeId) : undefined);
      return res.status(200).json(creatives);
    }
    if (req.method === 'POST') {
      const creative = await svc.createCreative(req.body);
      return res.status(201).json(creative);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing id' });
      }
      await svc.deleteCreative(Number(id));
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

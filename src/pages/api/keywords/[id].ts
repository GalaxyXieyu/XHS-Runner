import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getKeywordService() {
  return getService('keywordService', () => import('@/server/services/xhs/data/keywords'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getKeywordService();
    if (req.method === 'PUT') {
      const keyword = await svc.updateKeyword(id, req.body.value, req.body.isEnabled);
      return res.status(200).json(keyword);
    }
    if (req.method === 'DELETE') {
      const result = await svc.removeKeyword(id);
      return res.status(200).json(result);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getKeywordService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getKeywordService();
    if (req.method === 'GET') {
      const keywords = svc.listKeywords();
      return res.status(200).json(keywords);
    }
    if (req.method === 'POST') {
      const keyword = svc.addKeyword(req.body.value);
      return res.status(201).json(keyword);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

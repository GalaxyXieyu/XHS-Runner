import type { NextApiRequest, NextApiResponse } from 'next';
import { getCaptureService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const svc = await getCaptureService();
    const { keywordId, limit = 50 } = req.body;
    const result = await svc.runCapture(keywordId, limit);
    return res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

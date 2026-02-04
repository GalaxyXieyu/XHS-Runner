import type { NextApiRequest, NextApiResponse } from 'next';
import { processNextPublishRecord } from '@/server/services/xhs/publish/publishQueue';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await processNextPublishRecord();
    return res.status(200).json({ ok: true, result });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

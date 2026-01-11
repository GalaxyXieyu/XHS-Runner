import type { NextApiRequest, NextApiResponse } from 'next';
import { getThemeService } from '../_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getThemeService();
    const result = svc.setThemeStatus(id, req.body.status);
    return res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

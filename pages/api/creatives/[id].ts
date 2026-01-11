import type { NextApiRequest, NextApiResponse } from 'next';
import { getCreativeService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getCreativeService();
    if (req.method === 'PUT') {
      const creative = svc.updateCreative({ id, ...req.body });
      return res.status(200).json(creative);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

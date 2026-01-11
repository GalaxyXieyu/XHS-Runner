import type { NextApiRequest, NextApiResponse } from 'next';
import { getPromptProfileService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getPromptProfileService();
    if (req.method === 'GET') {
      const profile = svc.getPromptProfile(id);
      return res.status(200).json(profile);
    }
    if (req.method === 'PUT') {
      const profile = svc.updatePromptProfile({ id, ...req.body });
      return res.status(200).json(profile);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

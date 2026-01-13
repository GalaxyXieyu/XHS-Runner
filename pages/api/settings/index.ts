import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '../_init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { getSettings, setSettings } = await getService(
      'settings',
      () => import('../../../src/server/settings')
    );

    if (req.method === 'GET') {
      return res.status(200).json(getSettings());
    }
    if (req.method === 'PUT') {
      const updated = setSettings(req.body);
      return res.status(200).json(updated);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

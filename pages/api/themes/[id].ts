import type { NextApiRequest, NextApiResponse } from 'next';
import { getThemeService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getThemeService();
    if (req.method === 'PUT') {
      const theme = svc.updateTheme({ id, ...req.body });
      return res.status(200).json(theme);
    }
    if (req.method === 'DELETE') {
      const result = svc.removeTheme(id);
      return res.status(200).json(result);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

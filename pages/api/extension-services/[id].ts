import type { NextApiRequest, NextApiResponse } from 'next';
import { getExtensionService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const svc = await getExtensionService();

    if (req.method === 'GET') {
      const service = svc.getExtensionService(id);
      if (!service) return res.status(404).json({ error: 'Not found' });
      return res.json(service);
    }

    if (req.method === 'PUT') {
      const service = svc.updateExtensionService(id, req.body);
      if (!service) return res.status(404).json({ error: 'Not found' });
      return res.json(service);
    }

    if (req.method === 'DELETE') {
      const deleted = svc.deleteExtensionService(id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

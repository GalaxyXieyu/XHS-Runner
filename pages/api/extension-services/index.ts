import type { NextApiRequest, NextApiResponse } from 'next';
import { getExtensionService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getExtensionService();

    if (req.method === 'GET') {
      const services = svc.listExtensionServices();
      return res.json(services);
    }

    if (req.method === 'POST') {
      const service = svc.createExtensionService(req.body);
      return res.status(201).json(service);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

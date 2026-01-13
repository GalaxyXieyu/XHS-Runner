// GET/PUT/DELETE /api/jobs/[id]
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSchedulerModule } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const mod = await getSchedulerModule();
    const id = Number(req.query.id);

    if (req.method === 'GET') {
      const job = await mod.getJob(id);
      if (!job) return res.status(404).json({ error: '任务不存在' });
      return res.status(200).json(job);
    }

    if (req.method === 'PUT') {
      const job = await mod.updateJob(id, req.body);
      return res.status(200).json(job);
    }

    if (req.method === 'DELETE') {
      await mod.deleteJob(id);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

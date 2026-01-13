// GET /api/jobs/executions
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSchedulerModule } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const mod = await getSchedulerModule();
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const executions = await mod.listExecutions(jobId, limit);
    return res.status(200).json(executions);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

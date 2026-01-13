// GET /api/jobs - 获取任务列表
// POST /api/jobs - 创建任务
import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getSchedulerModule() {
  return getService('schedulerModule', () => import('@/server/services/scheduler'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const mod = await getSchedulerModule();

    if (req.method === 'GET') {
      const themeId = req.query.themeId ? Number(req.query.themeId) : undefined;
      const jobs = await mod.listJobs(themeId);
      return res.status(200).json(jobs);
    }

    if (req.method === 'POST') {
      const job = await mod.createJob(req.body);
      return res.status(201).json(job);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

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
      const jobType = (req.query.jobType || req.query.job_type) as string | string[] | undefined;
      const isEnabled = (req.query.isEnabled || req.query.is_enabled) as string | string[] | undefined;
      let jobs = await mod.listJobs(themeId);

      if (jobType) {
        const value = Array.isArray(jobType) ? jobType[0] : jobType;
        jobs = jobs.filter((job: any) => job.job_type === value);
      }

      if (isEnabled !== undefined) {
        const raw = Array.isArray(isEnabled) ? isEnabled[0] : isEnabled;
        const enabled = raw === '1' || raw === 'true';
        jobs = jobs.filter((job: any) => {
          if (typeof job.is_enabled === 'boolean') return job.is_enabled === enabled;
          return Number(job.is_enabled) === (enabled ? 1 : 0);
        });
      }

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

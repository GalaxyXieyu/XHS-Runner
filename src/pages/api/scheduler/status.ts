// GET /api/scheduler/status - 获取调度器状态
import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getSchedulerModule() {
  return getService('schedulerModule', () => import('@/server/services/scheduler/scheduler'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const mod = await getSchedulerModule();
    const scheduler = mod.getScheduler();
    const status = await scheduler.getStatus();
    return res.status(200).json(status);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

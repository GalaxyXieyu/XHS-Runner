// POST /api/jobs/[id]/trigger - 手动触发任务执行（用于接口测试与非 Electron 环境）
import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getSchedulerModule() {
  return getService('schedulerModule', () => import('@/server/services/scheduler'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const mod = await getSchedulerModule();
    const id = Number(req.query.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'invalid job id' });
    }

    // Ensure scheduler is running so any follow-up scheduling works.
    await mod.getScheduler().start();
    const executionId = await mod.getScheduler().triggerJob(id);

    return res.status(200).json({ success: true, executionId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

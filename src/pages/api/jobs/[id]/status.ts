import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';
import { jobStatusSchema } from '@/server/services/scheduler/jobDto';

async function getSchedulerModule() {
  return getService('schedulerModule', () => import('@/server/services/scheduler'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    const mod = await getSchedulerModule();
    const { status } = jobStatusSchema.parse(req.body);

    // 获取当前任务
    const job = await mod.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // 更新任务状态 (is_enabled: true=active, false=paused)
    const isEnabled = status === 'active';
    const updated = await mod.updateJob(id, { is_enabled: isEnabled });

    return res.status(200).json({
      success: true,
      job: updated,
      status: status,
      message: status === 'active' ? '任务已启动' : '任务已暂停',
    });
  } catch (error: any) {
    console.error('Toggle job status error:', error);
    return res.status(500).json({ error: error.message });
  }
}

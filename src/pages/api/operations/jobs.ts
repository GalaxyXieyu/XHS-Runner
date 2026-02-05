import type { NextApiRequest, NextApiResponse } from 'next';
import { executeCommentSyncJob } from '@/server/services/scheduler/jobs/commentSyncJob';
import { executeMetricsCaptureJob } from '@/server/services/scheduler/jobs/metricsCaptureJob';

/**
 * 运营中心后台任务触发 API
 * POST /api/operations/jobs
 * body: { job: 'comment_sync' | 'metrics_capture' }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { job } = req.body;

  if (!job) {
    return res.status(400).json({ error: 'Missing job type' });
  }

  try {
    let result;

    switch (job) {
      case 'comment_sync':
        result = await executeCommentSyncJob();
        break;

      case 'metrics_capture':
        result = await executeMetricsCaptureJob();
        break;

      default:
        return res.status(400).json({ error: `Unknown job type: ${job}` });
    }

    return res.status(200).json({
      job,
      ...result,
    });
  } catch (error: any) {
    console.error(`Job ${job} error:`, error);
    return res.status(500).json({ error: error.message });
  }
}

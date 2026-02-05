import type { NextApiRequest, NextApiResponse } from 'next';
import { captureMetricsForPublishedNotes } from '@/server/services/xhs/operations/metricsCaptureService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { publishRecordId } = req.body;

    const result = await captureMetricsForPublishedNotes(
      publishRecordId ? Number(publishRecordId) : undefined
    );

    return res.status(200).json({
      success: true,
      ...result,
      message: `指标采集完成: ${result.captured} 条`,
    });
  } catch (error: any) {
    console.error('Metrics sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}

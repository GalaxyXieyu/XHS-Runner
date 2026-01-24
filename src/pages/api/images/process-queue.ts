import type { NextApiRequest, NextApiResponse } from 'next';
import { processImageDownloadQueue, getQueueStats } from '@/server/services/xhs/capture/imageDownloadService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // 获取队列状态
    try {
      const stats = await getQueueStats();
      return res.status(200).json({ success: true, stats });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'POST') {
    // 处理队列
    try {
      const batchSize = Number(req.query.batchSize) || 10;
      const result = await processImageDownloadQueue(batchSize);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

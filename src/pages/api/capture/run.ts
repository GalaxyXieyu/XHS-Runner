import type { NextApiRequest, NextApiResponse } from 'next';
import { runCapture } from '@/server/services/xhs/capture/capture';
import { checkStatus } from '@/server/services/xhs/integration/localService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    // Check login status before capture
    const authStatus = await checkStatus();
    if (!authStatus.loggedIn) {
      return res.status(401).json({
        error: '请先登录小红书账号',
        code: 'NOT_LOGGED_IN'
      });
    }

    const keywordId = Number(req.body?.keywordId);
    const limitRaw = Number(req.body?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 50;

    if (!Number.isFinite(keywordId) || keywordId <= 0) {
      return res.status(400).json({ error: 'keywordId must be a positive number' });
    }

    const result = await runCapture(keywordId, limit);
    return res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { isLangfuseEnabled, scoreTrace } from '@/server/services/langfuseService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const enabled = await isLangfuseEnabled();
    if (!enabled) {
      console.warn('[langfuse] score API skipped: not enabled');
      return res.status(400).json({ error: 'Langfuse not enabled' });
    }

    const { traceId, name, value, comment } = req.body || {};
    if (!traceId || !name || typeof value !== 'number') {
      return res.status(400).json({ error: 'Missing required fields: traceId, name, value' });
    }

    await scoreTrace({ traceId, name, value, comment });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

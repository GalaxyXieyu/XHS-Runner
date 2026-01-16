import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthService } from '@/server/services/xhs/core/auth/authServiceSingleton';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authService = getAuthService();
    const result = await authService.pollLoginStatus();
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

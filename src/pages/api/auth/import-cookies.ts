import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthService } from '@/server/services/xhs/core/auth/authServiceSingleton';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cookies } = req.body;

    if (!cookies || typeof cookies !== 'string') {
      return res.status(400).json({
        success: false,
        message: '请提供 Cookie 字符串',
      });
    }

    const authService = getAuthService();
    const result = await authService.importCookies(cookies);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Cookie 导入失败:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Cookie 导入失败',
    });
  }
}

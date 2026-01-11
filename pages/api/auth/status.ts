import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authService = await getAuthService();
    const result = await authService.checkStatus();
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, loggedIn: false, message: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

async function getThemeService() {
  return getService('themeService', () => import('@/server/services/xhs/data/themeService'));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getThemeService();
    if (req.method === 'GET') {
      const themes = await svc.listThemes();
      return res.status(200).json(themes);
    }
    if (req.method === 'POST') {
      const theme = await svc.createTheme(req.body);
      return res.status(201).json(theme);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

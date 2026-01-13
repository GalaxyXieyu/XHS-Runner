import type { NextApiRequest, NextApiResponse } from 'next';
import * as promptProfileService from '@/server/services/xhs/llm/promptProfileService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    if (req.method === 'GET') {
      const profile = await promptProfileService.getPromptProfile(id);
      return res.status(200).json(profile);
    }
    if (req.method === 'PUT') {
      const profile = await promptProfileService.updatePromptProfile({ id, ...(req.body || {}) });
      return res.status(200).json(profile);
    }
    if (req.method === 'DELETE') {
      const deleted = await promptProfileService.deletePromptProfile(id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

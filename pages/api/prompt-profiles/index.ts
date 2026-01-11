import type { NextApiRequest, NextApiResponse } from 'next';
import { getPromptProfileService } from './_shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = await getPromptProfileService();
    if (req.method === 'GET') {
      const profiles = svc.listPromptProfiles();
      return res.status(200).json(profiles);
    }
    if (req.method === 'POST') {
      const profile = svc.createPromptProfile(req.body);
      return res.status(201).json(profile);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import * as promptProfileService from '../../../src/server/services/xhs/promptProfileService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const profiles = await promptProfileService.listPromptProfiles();
      return res.status(200).json(profiles);
    }
    if (req.method === 'POST') {
      const profile = await promptProfileService.createPromptProfile(req.body);
      return res.status(201).json(profile);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

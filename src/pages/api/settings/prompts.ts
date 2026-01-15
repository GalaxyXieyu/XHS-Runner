import { NextApiRequest, NextApiResponse } from 'next';
import { getAllAgentPrompts, updateAgentPrompt, clearPromptCache } from '@/server/services/xhs/llm/agentPromptService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const prompts = await getAllAgentPrompts();
      return res.json({ prompts });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PUT') {
    const { name, systemPrompt } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'name and systemPrompt are required' });
    }

    try {
      const updated = await updateAgentPrompt(name, systemPrompt);
      if (!updated) {
        return res.status(404).json({ error: 'Prompt not found' });
      }
      return res.json({ prompt: updated });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST' && req.body.action === 'clearCache') {
    clearPromptCache();
    return res.json({ success: true, message: 'Cache cleared' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

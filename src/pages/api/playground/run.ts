import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { getSettings } = await getService('settings', () => import('@/server/settings'));
    const settings = await getSettings();

    const { systemPrompt, userMessage, model: requestModel } = req.body;
    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: 'systemPrompt and userMessage required' });
    }

    const baseUrl = settings.llmBaseUrl || 'https://api.openai.com/v1';
    const apiKey = settings.llmApiKey;
    const model = requestModel || settings.llmModel || 'gpt-4o';

    if (!apiKey) {
      return res.status(400).json({ error: '请先配置 LLM API Key' });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

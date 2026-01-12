import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import os from 'os';

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { setUserDataPath } = await import('../../../src/server/runtime/userDataPath');
  const { initializeDatabase } = await import('../../../src/server/db');
  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);
  initializeDatabase();
  initialized = true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await ensureInit();
    const { getTrendPromptData, getLLMConfigForAPI, getLatestTrendReport, getTrendHistory, saveTrendReport } = await import('../../../src/server/services/xhs/insightService');

    const { themeId } = req.query;
    if (!themeId) return res.status(400).json({ error: 'themeId required' });
    const id = parseInt(themeId as string, 10);

    if (req.method === 'GET') {
      const latest = getLatestTrendReport(id);
      const history = getTrendHistory(id, 7);
      return res.status(200).json({ latest, history });
    }

    if (req.method === 'POST') {
      const { providerId } = req.body || {};

      const promptData = getTrendPromptData(id);
      if (promptData.error) {
        return res.status(400).json({ error: promptData.error });
      }

      const llmConfig = await getLLMConfigForAPI(providerId);
      if (!llmConfig) {
        return res.status(400).json({ error: '请先配置LLM API' });
      }

      // Use Vercel AI SDK streamText
      const { streamText } = await import('ai');
      const { createOpenAI } = await import('@ai-sdk/openai');

      const openai = createOpenAI({
        baseURL: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
      });

      const result = streamText({
        model: openai(llmConfig.model),
        prompt: promptData.prompt!,
        onFinish: ({ text }) => {
          // Save report after streaming completes
          saveTrendReport(id, promptData.stats, text);
        },
      });

      return result.toTextStreamResponse();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '../_init';

// Disable response buffering for streaming
export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const insightService = await getService(
      'insightService',
      () => import('../../../src/server/services/xhs/insightService')
    );
    const { getTrendPromptData, getLatestTrendReport, getTrendHistory, saveTrendReport } = insightService;

    const { themeId } = req.query;
    if (!themeId) return res.status(400).json({ error: 'themeId required' });
    const id = parseInt(themeId as string, 10);

    if (req.method === 'GET') {
      const latest = await getLatestTrendReport(id);
      const history = await getTrendHistory(id, 7);
      console.log('[trend] GET themeId:', id, 'latest:', latest ? 'found' : 'null');
      return res.status(200).json({ latest, history });
    }

    if (req.method === 'POST') {
      const { providerId } = req.body || {};

      const promptData = await getTrendPromptData(id);
      if (promptData.error) {
        return res.status(400).json({ error: promptData.error });
      }

      // 使用封装好的流式服务
      const { streamToResponse } = await import('../../../src/server/services/llm/streamService');
      await streamToResponse(res, {
        prompt: promptData.prompt!,
        providerId,
        onFinish: async (text) => {
          // Save report after streaming completes
          try {
            await saveTrendReport(id, promptData.stats, text);
            console.log('[trend] Report saved successfully for theme:', id);
          } catch (err) {
            console.error('[trend] Failed to save report:', err);
          }
        },
      });
      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

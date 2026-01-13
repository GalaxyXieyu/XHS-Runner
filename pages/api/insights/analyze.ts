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
    const { getAnalysisPromptData, saveTitleAnalysis, getLatestTitleAnalysis } = insightService;

    // GET: 获取已保存的分析结果
    if (req.method === 'GET') {
      const { themeId } = req.query;
      if (!themeId) return res.status(400).json({ error: 'themeId required' });
      const id = parseInt(themeId as string, 10);
      const latest = await getLatestTitleAnalysis(id);
      console.log('[analyze] GET themeId:', id, 'latest:', latest ? 'found' : 'null');
      return res.status(200).json({ latest });
    }

    // POST: 生成新的分析
    if (req.method === 'POST') {
      const { themeId: themeIdRaw, days, sortBy, providerId, promptId } = req.body;
      if (!themeIdRaw) return res.status(400).json({ error: 'themeId required' });

      const themeId = parseInt(String(themeIdRaw), 10);
      if (!Number.isFinite(themeId)) return res.status(400).json({ error: 'invalid themeId' });

      const promptData = await getAnalysisPromptData(themeId, { days, sortBy }, promptId);
      if (promptData.error) {
        return res.status(400).json({ error: promptData.error });
      }

      // 使用封装好的流式服务
      const { streamToResponse } = await import('../../../src/server/services/llm/streamService');
      await streamToResponse(res, {
        prompt: promptData.prompt!,
        providerId,
        onFinish: async (text) => {
          try {
            await saveTitleAnalysis(themeId, text);
            console.log('[analyze] Analysis saved successfully for theme:', themeId);
          } catch (err) {
            console.error('[analyze] Failed to save analysis:', err);
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

import type { NextApiRequest, NextApiResponse } from 'next';
import { getService } from '@/server/nextApi/init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { listTopics, listTopicsByTheme, listTopicsByKeyword, countTopicsByTheme } = await getService(
      'topicService',
      () => import('@/server/services/xhs/data/topicService')
    );

    if (req.method === 'GET') {
      const { themeId, keywordId, limit, offset, sortBy } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 50;
      const offsetNum = offset ? parseInt(offset as string, 10) : 0;
      const sortByStr = (sortBy as string) || 'engagement';

      if (themeId) {
        const [topics, total] = await Promise.all([
          listTopicsByTheme(parseInt(themeId as string, 10), limitNum, offsetNum, sortByStr as any),
          countTopicsByTheme(parseInt(themeId as string, 10)),
        ]);
        return res.status(200).json({ topics, total, limit: limitNum, offset: offsetNum });
      }
      if (keywordId) {
        const topics = await listTopicsByKeyword(parseInt(keywordId as string, 10), limitNum);
        return res.status(200).json(topics);
      }
      const topics = await listTopics(limitNum);
      return res.status(200).json(topics);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Topics API error:', error);
    res.status(500).json({ error: error.message });
  }
}

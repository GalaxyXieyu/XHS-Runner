import type { NextApiRequest, NextApiResponse } from 'next';
import { syncCommentsForPublishedNotes } from '@/server/services/xhs/operations/commentSyncService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { publishRecordId } = req.body;

    // 如果指定了 publishRecordId，只同步该笔记的评论
    // 否则同步所有已发布笔记的评论
    const result = await syncCommentsForPublishedNotes(publishRecordId ? Number(publishRecordId) : undefined);

    return res.status(200).json({
      success: true,
      ...result,
      message: `同步完成: ${result.synced} 条评论`,
    });
  } catch (error: any) {
    console.error('Comments sync error:', error);
    return res.status(500).json({ error: error.message });
  }
}

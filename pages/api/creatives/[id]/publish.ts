import type { NextApiRequest, NextApiResponse } from 'next';
import { getCreativeService } from '../_shared';
import { enqueuePublish } from '../../../../src/server/services/xhs/publishService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid creative id' });
  }

  try {
    const svc = await getCreativeService();
    const creative = await svc.getCreative(id);

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const creativeAny = creative as any;
    const themeId = Number(creativeAny.theme_id ?? creativeAny.themeId ?? 0);
    if (!themeId) {
      return res.status(400).json({ error: 'Creative missing themeId' });
    }

    // 构造发布数据
    const publishData = {
      creativeId: id,
      themeId,
      title: Array.isArray(creativeAny.titles)
        ? creativeAny.titles[creativeAny.selected_title_index || creativeAny.selectedTitleIndex || 0]
        : creativeAny.title,
      content: creativeAny.content,
      tags: Array.isArray(creativeAny.tags) ? creativeAny.tags.join(',') : (creativeAny.tags ? String(creativeAny.tags) : ''),
      mediaUrls: creativeAny.cover_image || creativeAny.coverImage ? String(creativeAny.cover_image || creativeAny.coverImage) : '',
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
    };

    const published = await enqueuePublish(publishData);

    return res.status(201).json({
      success: true,
      publishRecord: published,
      message: '已加入发布队列',
    });
  } catch (error: any) {
    console.error('Publish error:', error);
    return res.status(500).json({ error: error.message });
  }
}

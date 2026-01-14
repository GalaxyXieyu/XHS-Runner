import type { NextApiRequest, NextApiResponse } from 'next';
import { renderStyledPrompts, getStyleTemplate, type AspectRatio } from '@/server/services/xhs/llm/styleTemplateService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { idea, styleKey = 'cozy', aspectRatio = '3:4', count = 4 } = req.body;

  if (!idea?.trim()) {
    return res.status(400).json({ error: 'idea is required' });
  }

  try {
    const [prompts, styleTemplate] = await Promise.all([
      renderStyledPrompts({
        idea,
        styleKey,
        aspectRatio: aspectRatio as AspectRatio,
        count: Math.min(9, Math.max(1, count)),
      }),
      getStyleTemplate(styleKey),
    ]);

    return res.status(200).json({
      prompts,
      styleTemplate: styleTemplate ? { key: styleTemplate.key, name: styleTemplate.name, category: styleTemplate.category } : null,
      canEdit: true,
    });
  } catch (error) {
    console.error('Preview generation failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Generation failed' });
  }
}

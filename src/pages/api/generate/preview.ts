import type { NextApiRequest, NextApiResponse } from 'next';
import { renderStyledPrompts, getStyleTemplate, type AspectRatio } from '@/server/services/xhs/llm/styleTemplateService';

const DEFAULT_STYLE_KEY = 'cozy';
const DEFAULT_ASPECT_RATIO: AspectRatio = '3:4';
const ALLOWED_ASPECT_RATIOS = new Set<string>(['3:4', '1:1', '4:3']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { idea, styleKey = DEFAULT_STYLE_KEY, aspectRatio = DEFAULT_ASPECT_RATIO, count = 4 } = req.body;

  if (!idea?.trim()) {
    return res.status(400).json({ error: 'idea is required' });
  }

  try {
    const safeCount = Math.min(9, Math.max(1, Number(count) || 4));
    const normalizedAspectRatio = ALLOWED_ASPECT_RATIOS.has(String(aspectRatio)) ? (aspectRatio as AspectRatio) : DEFAULT_ASPECT_RATIO;

    let effectiveStyleKey = String(styleKey || '').trim() || DEFAULT_STYLE_KEY;
    let effectiveTemplate = await getStyleTemplate(effectiveStyleKey);
    if (!effectiveTemplate && effectiveStyleKey !== DEFAULT_STYLE_KEY) {
      effectiveStyleKey = DEFAULT_STYLE_KEY;
      effectiveTemplate = await getStyleTemplate(DEFAULT_STYLE_KEY);
    }

    const [prompts, styleTemplate] = await Promise.all([
      renderStyledPrompts({
        idea,
        styleKey: effectiveStyleKey,
        aspectRatio: normalizedAspectRatio,
        count: safeCount,
      }),
      Promise.resolve(effectiveTemplate),
    ]);

    return res.status(200).json({
      prompts,
      styleTemplate: styleTemplate ? { key: styleTemplate.key, name: styleTemplate.name, category: styleTemplate.category } : null,
      canEdit: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('Preview generation failed:', message);
    return res.status(500).json({ error: message });
  }
}

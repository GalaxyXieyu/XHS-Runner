import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { enqueueBatch } from '@/server/services/xhs/llm/generationQueue';
import type { ImageModel } from '@/server/services/xhs/integration/imageProvider';

const ALLOWED_IMAGE_MODELS = new Set<ImageModel>(['nanobanana', 'jimeng']);
const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompts, model = 'nanobanana', themeId, saveAsTemplate } = req.body;

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: prompts array is required' });
  }

  try {
    const normalizedPrompts = prompts
      .map((prompt: any) => String(prompt ?? '').trim())
      .filter(Boolean)
      .slice(0, 9);

    if (normalizedPrompts.length === 0) {
      return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: prompts must contain non-empty strings' });
    }

    const normalizedModel = String(model || '').trim() as ImageModel;
    if (!ALLOWED_IMAGE_MODELS.has(normalizedModel)) {
      return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: model must be nanobanana or jimeng' });
    }

    const normalizedThemeId =
      themeId !== undefined && themeId !== null && themeId !== '' ? Number(themeId) : null;
    if (normalizedThemeId !== null && !Number.isFinite(normalizedThemeId)) {
      return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: themeId must be a number' });
    }

    // 创建 creative 记录
    const [creative] = await db
      .insert(schema.creatives)
      .values({
        themeId: normalizedThemeId,
        status: 'generating',
        model: normalizedModel,
      })
      .returning({ id: schema.creatives.id });

    // 入队所有任务
    const tasks = await enqueueBatch(
      normalizedPrompts.map((prompt: string) => ({
        prompt,
        model: normalizedModel,
        themeId: normalizedThemeId ?? undefined,
        creativeId: creative.id,
      }))
    );

    // 可选：保存为新模板
    if (saveAsTemplate?.key && saveAsTemplate?.name) {
      const key = String(saveAsTemplate.key || '').trim();
      const name = String(saveAsTemplate.name || '').trim();
      if (!TEMPLATE_KEY_PATTERN.test(key)) {
        return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: saveAsTemplate.key is invalid' });
      }
      if (!name) {
        return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: saveAsTemplate.name is required' });
      }
      await db.insert(schema.imageStyleTemplates).values({
        key,
        name,
        systemPrompt: '用户自定义模板',
        isBuiltin: false,
      }).onConflictDoNothing();
    }

    return res.status(200).json({
      creativeId: creative.id,
      taskIds: tasks.map((t) => t.id),
      status: 'queued',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('Confirm generation failed:', message);
    return res.status(500).json({ error: `IDEA_CONFIRM_INTERNAL: ${message}` });
  }
}

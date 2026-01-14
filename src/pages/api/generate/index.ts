import type { NextApiRequest, NextApiResponse } from 'next';
import { enqueueBatch } from '@/server/services/xhs/llm/generationQueue';
import { renderStyledPrompts, type AspectRatio } from '@/server/services/xhs/llm/styleTemplateService';
import { ensureInit } from '@/server/nextApi/init';
import { db, schema } from '@/server/db';
import type { ImageModel } from '@/server/services/xhs/integration/imageProvider';

const DEFAULT_STYLE_KEY = 'cozy';
const DEFAULT_ASPECT_RATIO: AspectRatio = '3:4';
const ALLOWED_ASPECT_RATIOS = new Set<string>(['3:4', '1:1', '4:3']);
const ALLOWED_GOALS = new Set<string>(['collects', 'comments', 'followers']);
const ALLOWED_IMAGE_MODELS = new Set<ImageModel>(['nanobanana', 'jimeng']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureInit();

    const {
      prompt,
      idea,
      model,
      topicId,
      themeId,
      templateKey,
      count,
      outputCount,
      styleKey,
      aspectRatio,
      goal,
      persona,
      tone,
      extraRequirements,
    } = req.body;

    const inputIdea = String(idea ?? prompt ?? '').trim();
    if (!inputIdea) {
      return res.status(400).json({ error: 'IDEA_CONFIRM_BAD_REQUEST: idea/prompt is required' });
    }

    const normalizedThemeId = themeId !== undefined && themeId !== null ? Number(themeId) : undefined;
    const normalizedTopicId = topicId !== undefined && topicId !== null ? Number(topicId) : undefined;
    const normalizedCountRaw = count ?? outputCount ?? 1;
    const normalizedCount = Math.min(9, Math.max(1, Number(normalizedCountRaw) || 1));

    const normalizedModel = String(model || '').trim() as ImageModel;
    const effectiveModel: ImageModel = ALLOWED_IMAGE_MODELS.has(normalizedModel) ? normalizedModel : (model ? 'nanobanana' : 'jimeng');

    const normalizedAspectRatio = ALLOWED_ASPECT_RATIOS.has(String(aspectRatio))
      ? (aspectRatio as AspectRatio)
      : DEFAULT_ASPECT_RATIO;
    const normalizedStyleKey = String(styleKey || '').trim() || DEFAULT_STYLE_KEY;
    const normalizedGoal = ALLOWED_GOALS.has(String(goal)) ? (goal as 'collects' | 'comments' | 'followers') : undefined;

    const prompts = await renderStyledPrompts({
      idea: inputIdea,
      styleKey: normalizedStyleKey,
      aspectRatio: normalizedAspectRatio,
      count: normalizedCount,
      context: {
        goal: normalizedGoal,
        persona: typeof persona === 'string' ? persona : undefined,
        tone: typeof tone === 'string' ? tone : undefined,
        extraRequirements: typeof extraRequirements === 'string' ? extraRequirements : undefined,
      },
    });

    const [creative] = await db
      .insert(schema.creatives)
      .values({
        themeId: Number.isFinite(normalizedThemeId) ? normalizedThemeId! : null,
        sourceTopicId: Number.isFinite(normalizedTopicId) ? normalizedTopicId! : null,
        status: 'generating',
        model: effectiveModel,
      })
      .returning({ id: schema.creatives.id });

    const tasks = await enqueueBatch(
      prompts.map((p) => ({
        prompt: p,
        model: effectiveModel,
        themeId: normalizedThemeId,
        topicId: normalizedTopicId,
        creativeId: creative.id,
        templateKey,
      }))
    );

    return res.status(201).json({
      creativeId: creative.id,
      prompts,
      taskId: tasks[0]?.id,
      taskIds: tasks.map((t) => t.id),
      prompt: tasks[0]?.prompt,
      status: 'queued',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

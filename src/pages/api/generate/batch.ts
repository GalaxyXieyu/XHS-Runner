import type { NextApiRequest, NextApiResponse } from 'next';
import { enqueueBatch } from '@/server/services/xhs/llm/generationQueue';
import { expandIdea } from '@/server/services/xhs/llm/ideaExpander';
import { ensureInit } from '@/server/nextApi/init';
import { db, schema } from '@/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureInit();

    const { idea, count, model, themeId } = req.body;

    if (!idea?.trim()) {
      return res.status(400).json({ error: 'idea is required' });
    }

    const safeCount = Math.max(1, Math.min(9, Number(count) || 4));
    const normalizedThemeId = themeId !== undefined && themeId !== null ? Number(themeId) : null;

    // 1. LLM 扩展 idea → N 个 prompts
    const prompts = await expandIdea(idea.trim(), safeCount);

    // 2. 创建 creative 记录
    const [creative] = await db
      .insert(schema.creatives)
      .values({
        themeId: normalizedThemeId,
        title: null,
        content: null,
        status: 'draft',
        model: model || 'nanobanana',
        prompt: idea.trim(),
      })
      .returning({ id: schema.creatives.id });

    // 3. 批量创建 generation_tasks，关联到同一个 creative
    const tasks = await enqueueBatch(
      prompts.map((prompt) => ({
        prompt,
        model: model || 'nanobanana',
        themeId: normalizedThemeId ?? undefined,
        creativeId: creative.id,
      }))
    );

    return res.status(201).json({
      creativeId: creative.id,
      taskIds: tasks.map((t) => t.id),
      prompts,
      status: 'queued',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

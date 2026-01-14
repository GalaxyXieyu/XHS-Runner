import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { enqueueBatch } from '@/server/services/xhs/llm/generationQueue';
import type { ImageModel } from '@/server/services/xhs/integration/imageProvider';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompts, model = 'nanobanana', themeId, saveAsTemplate } = req.body;

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: 'prompts array is required' });
  }

  try {
    // 创建 creative 记录
    const [creative] = await db
      .insert(schema.creatives)
      .values({
        themeId: themeId ?? null,
        status: 'generating',
        model,
      })
      .returning({ id: schema.creatives.id });

    // 入队所有任务
    const tasks = await enqueueBatch(
      prompts.map((prompt: string) => ({
        prompt,
        model: model as ImageModel,
        themeId,
        creativeId: creative.id,
      }))
    );

    // 可选：保存为新模板
    if (saveAsTemplate?.key && saveAsTemplate?.name) {
      await db.insert(schema.imageStyleTemplates).values({
        key: saveAsTemplate.key,
        name: saveAsTemplate.name,
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
    console.error('Confirm generation failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Generation failed' });
  }
}

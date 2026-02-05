import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager } from '@/server/services/task';
import { desc, eq, and, gte } from 'drizzle-orm';
import { db, schema } from '@/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGetTasks(req, res);
  }

  if (req.method === 'POST') {
    return handlePostTask(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGetTasks(req: NextApiRequest, res: NextApiResponse) {
  // 解析查询参数
  const themeId = req.query.themeId ? Number(req.query.themeId) : undefined;
  const status = req.query.status as string | undefined;
  const limit = Number(req.query.limit) || 50;
  const timeRange = req.query.time_range as string | undefined;

  // 验证参数
  if (req.query.themeId && !Number.isFinite(themeId)) {
    return res.status(400).json({ error: 'Invalid themeId' });
  }

  if (limit < 1 || limit > 200) {
    return res.status(400).json({ error: 'Limit must be between 1 and 200' });
  }

  // 构建查询条件
  const conditions = [];

  if (themeId) {
    conditions.push(eq(schema.generationTasks.themeId, themeId));
  }

  if (status) {
    conditions.push(eq(schema.generationTasks.status, status));
  }

  if (timeRange && timeRange !== 'all') {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 0;
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      conditions.push(gte(schema.generationTasks.createdAt, since));
    }
  }

  // 执行查询
  let query = db
    .select({
      id: schema.generationTasks.id,
      status: schema.generationTasks.status,
      prompt: schema.generationTasks.prompt,
      model: schema.generationTasks.model,
      errorMessage: schema.generationTasks.errorMessage,
      createdAt: schema.generationTasks.createdAt,
      updatedAt: schema.generationTasks.updatedAt,
    })
    .from(schema.generationTasks)
    .orderBy(desc(schema.generationTasks.createdAt))
    .limit(limit);

  // 应用过滤条件
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  try {
    const tasks = await query;

    // 格式化响应
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      status: task.status,
      prompt: task.prompt,
      model: task.model,
      error_message: task.errorMessage,
      created_at: task.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: task.updatedAt?.toISOString() || new Date().toISOString(),
    }));

    return res.status(200).json(formattedTasks);
  } catch (error: any) {
    console.error('[tasks] query failed:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}

async function handlePostTask(req: NextApiRequest, res: NextApiResponse) {
  const { message, themeId, enableHITL, referenceImages, imageGenProvider, sourceTaskId } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const themeIdNumber = Number(themeId);
  if (!Number.isFinite(themeIdNumber)) {
    return res.status(400).json({ error: 'themeId is required' });
  }

  const refImages = Array.isArray(referenceImages)
    ? referenceImages
    : referenceImages
      ? [String(referenceImages)]
      : undefined;

  try {
    const result = await taskManager.submitTask({
      message: String(message),
      themeId: themeIdNumber,
      enableHITL: Boolean(enableHITL),
      referenceImages: refImages,
      imageGenProvider: imageGenProvider ? String(imageGenProvider) : undefined,
      sourceTaskId: sourceTaskId ? Number(sourceTaskId) : undefined,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('[tasks] submit failed:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}

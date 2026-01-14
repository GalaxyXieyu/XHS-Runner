import { supabase } from '../../../supabase';
import { db, schema } from '../../../db';
import { eq } from 'drizzle-orm';
import { storeAsset } from '../integration/assetStore';
import { generateImage, ImageModel } from '../integration/imageProvider';
import { renderTemplate } from './promptTemplates';
import { updateTopicStatus } from '../data/topicService';

let isPaused = false;
let isProcessing = false;
const queue: number[] = [];

async function resolveThemeAndTopicIds(payload: { themeId?: number; topicId?: number }) {
  const inputThemeId = Number.isFinite(payload.themeId) ? payload.themeId! : null;
  const inputTopicId = Number.isFinite(payload.topicId) ? payload.topicId! : null;

  if (inputTopicId !== null) {
    try {
      const [topic] = await db
        .select({ id: schema.topics.id, themeId: schema.topics.themeId })
        .from(schema.topics)
        .where(eq(schema.topics.id, inputTopicId))
        .limit(1);

      if (topic) {
        return {
          themeId: (topic.themeId ?? inputThemeId) ?? null,
          topicId: topic.id,
        };
      }
    } catch {
      // Drizzle 未配置/查询失败时降级：保持向后兼容
    }

    // 兼容旧调用：topicId 传的是 themeId（前端历史行为）
    if (inputThemeId === null) {
      return { themeId: inputTopicId, topicId: null };
    }
  }

  return { themeId: inputThemeId, topicId: null };
}

function startProcessing() {
  void processQueue().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[generationQueue] processQueue failed:', err);
  });
}

async function createTask({
  themeId,
  topicId,
  creativeId,
  prompt,
  templateKey,
  model,
}: {
  themeId?: number;
  topicId?: number;
  creativeId?: number;
  prompt: string;
  templateKey?: string;
  model?: ImageModel;
}) {
  const resolved = await resolveThemeAndTopicIds({ themeId, topicId });
  const finalPrompt = renderTemplate(templateKey || 'default', { topic: prompt });

  const { data, error } = await supabase
    .from('generation_tasks')
    .insert({
      theme_id: resolved.themeId,
      topic_id: resolved.topicId,
      creative_id: creativeId ?? null,
      status: 'queued',
      prompt: finalPrompt,
      model: model || 'nanobanana',
    })
    .select('id')
    .single();

  if (error) throw error;

  if (resolved.topicId) {
    try {
      await updateTopicStatus(resolved.topicId, 'generating');
    } catch {
      // Ignore invalid transitions
    }
  }

  return { id: data!.id, prompt: finalPrompt };
}

export async function enqueueTask(payload: {
  themeId?: number;
  topicId?: number;
  creativeId?: number;
  prompt: string;
  templateKey?: string;
  model?: ImageModel;
}) {
  const task = await createTask(payload);
  queue.push(task.id);
  startProcessing();
  return task;
}

export async function enqueueBatch(tasks: Array<{
  themeId?: number;
  topicId?: number;
  creativeId?: number;
  prompt: string;
  templateKey?: string;
  model?: ImageModel;
}>) {
  const results = [];
  for (const task of tasks) {
    results.push(await enqueueTask(task));
  }
  return results;
}

export function pauseQueue() {
  isPaused = true;
  return { paused: true, queued: queue.length };
}

export function resumeQueue() {
  isPaused = false;
  startProcessing();
  return { paused: false, queued: queue.length };
}

export async function cancelTask(taskId: number) {
  const index = queue.indexOf(taskId);
  if (index >= 0) {
    queue.splice(index, 1);
  }

  await supabase
    .from('generation_tasks')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', taskId);

  return { id: taskId, status: 'canceled' };
}

export function getQueueStats() {
  return { queued: queue.length, paused: isPaused, processing: isProcessing };
}

async function processQueue() {
  if (isProcessing || isPaused || queue.length === 0) {
    return;
  }
  isProcessing = true;
  try {
    while (queue.length > 0 && !isPaused) {
      const taskId = queue.shift();
      if (taskId === undefined) continue;
      try {
        await handleTask(taskId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[generationQueue] task ${taskId} failed:`, err);
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function handleTask(taskId: number) {
  const { data: task, error } = await supabase
    .from('generation_tasks')
    .select('id, prompt, model, theme_id, topic_id, creative_id')
    .eq('id', taskId)
    .single();

  if (error) throw error;
  if (!task) return;

  const nowIso = new Date().toISOString();
  await supabase
    .from('generation_tasks')
    .update({ status: 'generating', updated_at: nowIso })
    .eq('id', taskId);

  try {
    const result = await generateImage({ prompt: task.prompt, model: task.model || 'nanobanana' });
    const filename = `${task.model || 'nanobanana'}-${task.id}.png`;
    const asset = await storeAsset({
      type: 'image',
      filename,
      data: result.imageBuffer,
      metadata: {
        prompt: task.prompt,
        text: result.text,
        ...result.metadata,
      },
    });

    let creativeId: number | null = null;
    if (!task.creative_id) {
      try {
        const [created] = await db
          .insert(schema.creatives)
          .values({
            themeId: task.theme_id ?? null,
            sourceTopicId: task.topic_id ?? null,
            title: null,
            content: result.text || null,
            status: 'draft',
            model: task.model || null,
            prompt: task.prompt || null,
            resultAssetId: asset.id,
          })
          .returning({ id: schema.creatives.id });

        creativeId = created?.id ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[generationQueue] create creative failed:', err);
      }
    }

    const finalCreativeId = creativeId ?? task.creative_id ?? null;

    await supabase
      .from('generation_tasks')
      .update({
        status: 'done',
        result_asset_id: asset.id,
        creative_id: finalCreativeId,
        result_json: { text: result.text, metadata: result.metadata },
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // 创建 creative_assets 关联
    if (finalCreativeId) {
      try {
        await db.insert(schema.creativeAssets).values({
          creativeId: finalCreativeId,
          assetId: asset.id,
        });
      } catch {
        // Ignore duplicate or constraint errors
      }
    }

    if (task.topic_id) {
      try {
        await updateTopicStatus(task.topic_id, 'reviewing');
      } catch {
        // Ignore invalid transitions
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[generationQueue] handleTask(${taskId}) failed:`, err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    await supabase
      .from('generation_tasks')
      .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (task.topic_id) {
      try {
        await updateTopicStatus(task.topic_id, 'failed');
      } catch {
        // Ignore invalid transitions
      }
    }
  }
}

// Backward compatible aliases (older routes/tools may use these names)
export async function enqueueGeneration(payload: {
  themeId?: number;
  topicId?: number;
  prompt: string;
  templateKey?: string;
  model?: ImageModel;
}) {
  return enqueueTask(payload);
}

export function pause() {
  return pauseQueue();
}

export function resume() {
  return resumeQueue();
}

export function getStatus() {
  return getQueueStats();
}

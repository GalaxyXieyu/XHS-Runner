import { supabase } from '../../supabase';
import { storeAsset } from './assetStore';
import { generateImage, ImageModel } from './imageProvider';
import { renderTemplate } from './promptTemplates';
import { updateTopicStatus } from './topicService';

let isPaused = false;
let isProcessing = false;
const queue: number[] = [];

async function createTask({
  topicId,
  prompt,
  templateKey,
  model,
}: {
  topicId?: number;
  prompt: string;
  templateKey?: string;
  model?: ImageModel;
}) {
  const finalPrompt = renderTemplate(templateKey || 'default', { topic: prompt });

  const { data } = await supabase
    .from('generation_tasks')
    .insert({
      topic_id: topicId || null,
      status: 'queued',
      prompt: finalPrompt,
      model: model || 'nanobanana'
    })
    .select('id')
    .single();

  if (topicId) {
    try {
      await updateTopicStatus(topicId, 'generating');
    } catch {
      // Ignore invalid transitions
    }
  }

  return { id: data!.id, prompt: finalPrompt };
}

export async function enqueueTask(payload: { topicId?: number; prompt: string; templateKey?: string; model?: ImageModel }) {
  const task = await createTask(payload);
  queue.push(task.id);
  processQueue();
  return task;
}

export async function enqueueBatch(tasks: Array<{ topicId?: number; prompt: string; templateKey?: string; model?: ImageModel }>) {
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
  processQueue();
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

  while (queue.length > 0 && !isPaused) {
    const taskId = queue.shift();
    if (taskId !== undefined) {
      await handleTask(taskId);
    }
  }

  isProcessing = false;
}

async function handleTask(taskId: number) {
  const { data: task } = await supabase
    .from('generation_tasks')
    .select('id, prompt, model, topic_id')
    .eq('id', taskId)
    .single();

  if (!task) return;

  await supabase
    .from('generation_tasks')
    .update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', taskId);

  try {
    const result = await generateImage({ prompt: task.prompt, model: task.model || 'nanobanana' });
    const filename = `${task.model || 'nanobanana'}-${task.id}.png`;
    const asset = storeAsset({
      type: 'image',
      filename,
      data: result.imageBuffer,
      metadata: {
        prompt: task.prompt,
        text: result.text,
        ...result.metadata,
      },
    });

    await supabase
      .from('generation_tasks')
      .update({ status: 'done', result_asset_id: asset.id, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (task.topic_id) {
      try {
        await updateTopicStatus(task.topic_id, 'reviewing');
      } catch {
        // Ignore invalid transitions
      }
    }
  } catch {
    await supabase
      .from('generation_tasks')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
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

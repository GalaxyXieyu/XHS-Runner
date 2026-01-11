import { getDatabase } from '../../db';
import { storeAsset } from './assetStore';
import { generateImage, ImageModel } from './imageProvider';
import { renderTemplate } from './promptTemplates';
import { updateTopicStatus } from './topicService';

let isPaused = false;
let isProcessing = false;
const queue: number[] = [];

function createTask({
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
  const db = getDatabase();
  const finalPrompt = renderTemplate(templateKey || 'default', { topic: prompt });
  const result = db
    .prepare(
      `INSERT INTO generation_tasks (topic_id, status, prompt, model, created_at, updated_at)
       VALUES (?, 'queued', ?, ?, datetime('now'), datetime('now'))`
    )
    .run(topicId || null, finalPrompt, model || 'nanobanana');
  if (topicId) {
    try {
      updateTopicStatus(topicId, 'generating');
    } catch (error) {
      // Ignore invalid transitions for now.
    }
  }
  return { id: result.lastInsertRowid, prompt: finalPrompt };
}

export function enqueueTask(payload: { topicId?: number; prompt: string; templateKey?: string; model?: ImageModel }) {
  const task = createTask(payload);
  queue.push(task.id);
  processQueue();
  return task;
}

export function enqueueBatch(tasks: Array<{ topicId?: number; prompt: string; templateKey?: string; model?: ImageModel }>) {
  return tasks.map((task) => enqueueTask(task));
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

export function cancelTask(taskId: number) {
  const db = getDatabase();
  const index = queue.indexOf(taskId);
  if (index >= 0) {
    queue.splice(index, 1);
  }
  db.prepare(
    `UPDATE generation_tasks SET status = 'canceled', updated_at = datetime('now') WHERE id = ?`
  ).run(taskId);
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
  const db = getDatabase();
  const task = db.prepare('SELECT id, prompt, model FROM generation_tasks WHERE id = ?').get(taskId);
  if (!task) {
    return;
  }

  db.prepare(
    `UPDATE generation_tasks SET status = 'generating', updated_at = datetime('now') WHERE id = ?`
  ).run(taskId);

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

    db.prepare(
      `UPDATE generation_tasks
       SET status = 'done', result_asset_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(asset.id, taskId);
    const taskRow = db.prepare('SELECT topic_id FROM generation_tasks WHERE id = ?').get(taskId);
    if (taskRow?.topic_id) {
      try {
        updateTopicStatus(taskRow.topic_id, 'reviewing');
      } catch (error) {
        // Ignore invalid transitions for now.
      }
    }
  } catch (error) {
    db.prepare(
      `UPDATE generation_tasks
       SET status = 'failed', updated_at = datetime('now')
       WHERE id = ?`
    ).run(taskId);
    const taskRow = db.prepare('SELECT topic_id FROM generation_tasks WHERE id = ?').get(taskId);
    if (taskRow?.topic_id) {
      try {
        updateTopicStatus(taskRow.topic_id, 'failed');
      } catch (error) {
        // Ignore invalid transitions for now.
      }
    }
  }
}

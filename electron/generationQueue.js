const { getDatabase } = require('./db');
const { storeAsset } = require('./assetStore');
const { generateContent } = require('./nanobananaClient');
const { renderTemplate } = require('./promptTemplates');

let isPaused = false;
let isProcessing = false;
const queue = [];

function createTask({ topicId, prompt, templateKey }) {
  const db = getDatabase();
  const finalPrompt = renderTemplate(templateKey || 'default', { topic: prompt });
  const result = db
    .prepare(
      `INSERT INTO generation_tasks (topic_id, status, prompt, created_at, updated_at)
       VALUES (?, 'queued', ?, datetime('now'), datetime('now'))`
    )
    .run(topicId || null, finalPrompt);
  return { id: result.lastInsertRowid, prompt: finalPrompt };
}

function enqueueTask(payload) {
  const task = createTask(payload);
  queue.push(task.id);
  processQueue();
  return task;
}

function enqueueBatch(tasks) {
  return tasks.map((task) => enqueueTask(task));
}

function pauseQueue() {
  isPaused = true;
  return { paused: true, queued: queue.length };
}

function resumeQueue() {
  isPaused = false;
  processQueue();
  return { paused: false, queued: queue.length };
}

function cancelTask(taskId) {
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

function getQueueStats() {
  return { queued: queue.length, paused: isPaused, processing: isProcessing };
}

async function processQueue() {
  if (isProcessing || isPaused || queue.length === 0) {
    return;
  }
  isProcessing = true;

  while (queue.length > 0 && !isPaused) {
    const taskId = queue.shift();
    await handleTask(taskId);
  }

  isProcessing = false;
}

async function handleTask(taskId) {
  const db = getDatabase();
  const task = db.prepare('SELECT id, prompt FROM generation_tasks WHERE id = ?').get(taskId);
  if (!task) {
    return;
  }

  db.prepare(
    `UPDATE generation_tasks SET status = 'generating', updated_at = datetime('now') WHERE id = ?`
  ).run(taskId);

  try {
    const result = await generateContent(task.prompt);
    const filename = `nanobanana-${task.id}.png`;
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
  } catch (error) {
    db.prepare(
      `UPDATE generation_tasks
       SET status = 'failed', updated_at = datetime('now')
       WHERE id = ?`
    ).run(taskId);
  }
}

module.exports = {
  cancelTask,
  enqueueBatch,
  enqueueTask,
  getQueueStats,
  pauseQueue,
  resumeQueue,
};

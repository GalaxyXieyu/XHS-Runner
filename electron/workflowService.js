const { getDatabase } = require('./db');
const { forceUpdateTopicStatus } = require('./topicService');
const { recordMetric } = require('./metricsService');

const DEFAULT_METRICS = ['views', 'likes', 'comments', 'saves', 'follows'];

function publishTopic(topicId, platform = 'xhs') {
  const db = getDatabase();
  const task = db
    .prepare(
      `SELECT id FROM generation_tasks
       WHERE topic_id = ? AND status = 'done'
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(topicId);

  if (!task) {
    throw new Error('No completed generation task found for topic');
  }

  const result = db
    .prepare(
      `INSERT INTO publish_records (task_id, platform, status, published_at, created_at)
       VALUES (?, ?, 'published', datetime('now'), datetime('now'))`
    )
    .run(task.id, platform);

  forceUpdateTopicStatus(topicId, 'published');

  DEFAULT_METRICS.forEach((metricKey) => {
    recordMetric({ publishRecordId: result.lastInsertRowid, metricKey, metricValue: 0 });
  });

  return { publishRecordId: result.lastInsertRowid, taskId: task.id };
}

function rollbackTopic(topicId) {
  const db = getDatabase();
  db.prepare(
    `UPDATE generation_tasks
     SET status = 'canceled', updated_at = datetime('now')
     WHERE topic_id = ? AND status IN ('queued', 'generating')`
  ).run(topicId);

  db.prepare(
    `UPDATE publish_records
     SET status = 'canceled'
     WHERE task_id IN (SELECT id FROM generation_tasks WHERE topic_id = ?)`
  ).run(topicId);

  forceUpdateTopicStatus(topicId, 'failed');
  return { topicId, status: 'failed' };
}

module.exports = {
  publishTopic,
  rollbackTopic,
};

import { getDatabase } from '../../db';
import { forceUpdateTopicStatus } from './topicService';
import { recordMetric } from './metricsService';

const DEFAULT_METRICS = ['views', 'likes', 'comments', 'saves', 'follows'];

export async function publishTopic(topicId: number, platform = 'xhs') {
  const db = getDatabase();

  const { data: task, error: taskError } = await db
    .from('generation_tasks')
    .select('id, theme_id, creative_id')
    .eq('topic_id', topicId)
    .eq('status', 'done')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (taskError) throw taskError;

  if (!task) {
    throw new Error('No completed generation task found for topic');
  }

  const nowIso = new Date().toISOString();
  const responseJson = JSON.stringify({ platform, generation_task_id: task.id });

  const { data, error } = await db
    .from('publish_records')
    .insert({
      account_id: null,
      theme_id: task.theme_id || null,
      creative_id: task.creative_id || null,
      status: 'published',
      published_at: nowIso,
      updated_at: nowIso,
      response_json: responseJson,
    })
    .select('id')
    .single();
  if (error) throw error;
  const publishRecordId = Number(data.id);

  await forceUpdateTopicStatus(topicId, 'published');

  await Promise.all(
    DEFAULT_METRICS.map((metricKey) =>
      recordMetric({ publishRecordId, metricKey, metricValue: 0 })
    )
  );

  return { publishRecordId, taskId: task.id };
}

export async function rollbackTopic(topicId: number) {
  const db = getDatabase();
  const nowIso = new Date().toISOString();

  const { error: cancelError } = await db
    .from('generation_tasks')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('topic_id', topicId)
    .in('status', ['queued', 'generating']);
  if (cancelError) throw cancelError;

  const { data: taskRows, error: taskError } = await db
    .from('generation_tasks')
    .select('creative_id')
    .eq('topic_id', topicId);
  if (taskError) throw taskError;

  const creativeIds = Array.from(
    new Set((taskRows || []).map((r: any) => r.creative_id).filter((v: any) => v !== null && v !== undefined))
  );

  if (creativeIds.length > 0) {
    const { error: publishError } = await db
      .from('publish_records')
      .update({ status: 'canceled', updated_at: nowIso })
      .in('creative_id', creativeIds);
    if (publishError) throw publishError;
  }

  await forceUpdateTopicStatus(topicId, 'failed');
  return { topicId, status: 'failed' };
}

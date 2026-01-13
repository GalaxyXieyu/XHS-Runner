// 每日自动生成任务 - 生成内容包草稿

import { ScheduledJob, ExecutionResult, DailyGenerateJobParams } from '../types';
import { ExecutionContext } from '../jobExecutor';
import { getClusterSummaries } from '../../xhs/summaryService';
import { createCreative } from '../../xhs/creativeService';

function resolveOutputCount(params: DailyGenerateJobParams) {
  return params.outputCount || params.output_count || 5;
}

export async function handleDailyGenerateJob(
  job: ScheduledJob,
  params: DailyGenerateJobParams,
  context: ExecutionContext
): Promise<ExecutionResult> {
  if (!job.theme_id) {
    return { success: false, error: 'theme_id required', duration_ms: 0 };
  }

  const outputCount = resolveOutputCount(params);
  const days = params.days || 7;
  const goal = params.goal || 'collects';

  const clusters = await getClusterSummaries(job.theme_id, days, goal);
  if (clusters.length === 0) {
    return { success: true, inserted: 0, total: 0, duration_ms: 0 };
  }

  let created = 0;
  const selected = clusters.slice(0, outputCount);

  for (const cluster of selected) {
    if (context.abortController.signal.aborted) {
      throw new Error('任务已取消');
    }

    const summary = cluster.summary;
    await createCreative({
      themeId: job.theme_id,
      title: summary.topTitles[0] || `主题${job.theme_id}内容包`,
      content: summary.summaries.join('\n'),
      tags: Array.isArray(summary.tags) ? summary.tags.join(',') : (summary.tags ? String(summary.tags) : ''),
      status: 'draft',
      sourceTopicIds: '',
      coverPrompt: null,
      rationale: {
        clusterTag: cluster.tag,
        goal,
        topTitles: summary.topTitles,
      },
    });

    created += 1;
  }

  return { success: true, inserted: created, total: selected.length, duration_ms: 0 };
}

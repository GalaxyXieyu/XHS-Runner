// 调度器模块导出入口

export * from './types';
export * from './scheduler';
export * from './cronParser';
export { getRateLimiter, RateLimiter } from './rateLimiter';
export { JobQueue } from './jobQueue';
export { JobExecutor } from './jobExecutor';

// 任务管理 API
import { getDatabase } from '../../db';
import {
  ScheduledJob,
  JobExecution,
  CreateJobInput,
  UpdateJobInput,
} from './types';
import { getNextRunTime } from './cronParser';

export async function createJob(input: CreateJobInput): Promise<ScheduledJob> {
  const db = getDatabase();
  const nextRun = getNextRunTime(
    input.schedule_type,
    input.interval_minutes,
    input.cron_expression
  );

  const row = {
    name: input.name,
    job_type: input.job_type,
    theme_id: input.theme_id || null,
    keyword_id: input.keyword_id || null,
    schedule_type: input.schedule_type,
    interval_minutes: input.interval_minutes || null,
    cron_expression: input.cron_expression || null,
    params_json: input.params ? JSON.stringify(input.params) : null,
    is_enabled: input.is_enabled !== false ? 1 : 0,
    priority: input.priority || 5,
    next_run_at: nextRun.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('scheduled_jobs')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data as ScheduledJob;
}

export async function updateJob(id: number, input: UpdateJobInput): Promise<ScheduledJob> {
  const db = getDatabase();

  const { data: job, error: fetchError } = await db
    .from('scheduled_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!job) throw new Error('任务不存在');

  // 重新计算下次执行时间
  const scheduleType = input.schedule_type || job.schedule_type;
  const intervalMinutes = input.interval_minutes ?? job.interval_minutes;
  const cronExpression = input.cron_expression ?? job.cron_expression;
  const nextRun = getNextRunTime(scheduleType, intervalMinutes, cronExpression);

  const updateRow: any = { updated_at: new Date().toISOString(), next_run_at: nextRun.toISOString() };
  if (input.name !== undefined) updateRow.name = input.name;
  if (input.schedule_type !== undefined) updateRow.schedule_type = input.schedule_type;
  if (input.interval_minutes !== undefined) updateRow.interval_minutes = input.interval_minutes;
  if (input.cron_expression !== undefined) updateRow.cron_expression = input.cron_expression;
  if (input.params !== undefined) updateRow.params_json = JSON.stringify(input.params);
  if (input.is_enabled !== undefined) updateRow.is_enabled = input.is_enabled ? 1 : 0;
  if (input.priority !== undefined) updateRow.priority = input.priority;

  const { data: updated, error: updateError } = await db
    .from('scheduled_jobs')
    .update(updateRow)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return updated as ScheduledJob;
}

export async function deleteJob(id: number): Promise<void> {
  const db = getDatabase();
  const { error } = await db.from('scheduled_jobs').delete().eq('id', id);
  if (error) throw error;
}

export async function getJob(id: number): Promise<ScheduledJob | null> {
  const db = getDatabase();
  const { data, error } = await db.from('scheduled_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}

export async function listJobs(themeId?: number): Promise<ScheduledJob[]> {
  const db = getDatabase();

  if (themeId) {
    const { data, error } = await db
      .from('scheduled_jobs')
      .select('*')
      .eq('theme_id', themeId)
      .order('priority', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as any) || [];
  }

  const { data, error } = await db
    .from('scheduled_jobs')
    .select('*')
    .order('priority', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

export async function listExecutions(jobId?: number, limit = 50): Promise<JobExecution[]> {
  const db = getDatabase();

  if (jobId) {
    const { data, error } = await db
      .from('job_executions')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as any) || [];
  }

  const { data, error } = await db
    .from('job_executions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as any) || [];
}

export async function getJobByTheme(themeId: number): Promise<ScheduledJob | null> {
  const db = getDatabase();
  const { data, error } = await db
    .from('scheduled_jobs')
    .select('*')
    .eq('theme_id', themeId)
    .eq('job_type', 'capture_theme')
    .maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}

export async function getJobByKeyword(keywordId: number): Promise<ScheduledJob | null> {
  const db = getDatabase();
  const { data, error } = await db
    .from('scheduled_jobs')
    .select('*')
    .eq('keyword_id', keywordId)
    .eq('job_type', 'capture_keyword')
    .maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}

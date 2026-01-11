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

export function createJob(input: CreateJobInput): ScheduledJob {
  const db = getDatabase();
  const nextRun = getNextRunTime(
    input.schedule_type,
    input.interval_minutes,
    input.cron_expression
  );

  const result = db.prepare(`
    INSERT INTO scheduled_jobs (
      name, job_type, theme_id, keyword_id,
      schedule_type, interval_minutes, cron_expression,
      params_json, is_enabled, priority, next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.job_type,
    input.theme_id || null,
    input.keyword_id || null,
    input.schedule_type,
    input.interval_minutes || null,
    input.cron_expression || null,
    input.params ? JSON.stringify(input.params) : null,
    input.is_enabled !== false ? 1 : 0,
    input.priority || 5,
    nextRun.toISOString()
  );

  return db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
    .get(result.lastInsertRowid) as ScheduledJob;
}

export function updateJob(id: number, input: UpdateJobInput): ScheduledJob {
  const db = getDatabase();
  const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
    .get(id) as ScheduledJob;
  if (!job) throw new Error('任务不存在');

  const updates: string[] = ['updated_at = datetime("now")'];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.schedule_type !== undefined) {
    updates.push('schedule_type = ?');
    values.push(input.schedule_type);
  }
  if (input.interval_minutes !== undefined) {
    updates.push('interval_minutes = ?');
    values.push(input.interval_minutes);
  }
  if (input.cron_expression !== undefined) {
    updates.push('cron_expression = ?');
    values.push(input.cron_expression);
  }
  if (input.params !== undefined) {
    updates.push('params_json = ?');
    values.push(JSON.stringify(input.params));
  }
  if (input.is_enabled !== undefined) {
    updates.push('is_enabled = ?');
    values.push(input.is_enabled ? 1 : 0);
  }
  if (input.priority !== undefined) {
    updates.push('priority = ?');
    values.push(input.priority);
  }

  // 重新计算下次执行时间
  const scheduleType = input.schedule_type || job.schedule_type;
  const intervalMinutes = input.interval_minutes ?? job.interval_minutes;
  const cronExpression = input.cron_expression ?? job.cron_expression;
  const nextRun = getNextRunTime(scheduleType, intervalMinutes, cronExpression);
  updates.push('next_run_at = ?');
  values.push(nextRun.toISOString());

  values.push(id);
  db.prepare(`UPDATE scheduled_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as ScheduledJob;
}

export function deleteJob(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id);
}

export function getJob(id: number): ScheduledJob | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as ScheduledJob | null;
}

export function listJobs(themeId?: number): ScheduledJob[] {
  const db = getDatabase();
  if (themeId) {
    return db.prepare('SELECT * FROM scheduled_jobs WHERE theme_id = ? ORDER BY priority, name')
      .all(themeId) as ScheduledJob[];
  }
  return db.prepare('SELECT * FROM scheduled_jobs ORDER BY priority, name').all() as ScheduledJob[];
}

export function listExecutions(jobId?: number, limit = 50): JobExecution[] {
  const db = getDatabase();
  if (jobId) {
    return db.prepare(`
      SELECT * FROM job_executions WHERE job_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(jobId, limit) as JobExecution[];
  }
  return db.prepare(`
    SELECT * FROM job_executions ORDER BY created_at DESC LIMIT ?
  `).all(limit) as JobExecution[];
}

export function getJobByTheme(themeId: number): ScheduledJob | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM scheduled_jobs WHERE theme_id = ? AND job_type = 'capture_theme'
  `).get(themeId) as ScheduledJob | null;
}

export function getJobByKeyword(keywordId: number): ScheduledJob | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM scheduled_jobs WHERE keyword_id = ? AND job_type = 'capture_keyword'
  `).get(keywordId) as ScheduledJob | null;
}

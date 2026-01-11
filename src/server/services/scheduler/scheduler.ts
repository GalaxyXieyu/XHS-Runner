// 调度器核心 - 管理定时任务的调度和执行

import { getDatabase } from '../../db';
import {
  ScheduledJob,
  JobExecution,
  SchedulerConfig,
  SchedulerStatus,
  CreateJobInput,
  UpdateJobInput,
  DEFAULT_SCHEDULER_CONFIG,
  TriggerType,
} from './types';
import { JobQueue } from './jobQueue';
import { JobExecutor } from './jobExecutor';
import { getNextRunTime } from './cronParser';
import { handleCaptureJob } from './jobs/captureJob';
import { handleDailyGenerateJob } from './jobs/dailyGenerateJob';

export class Scheduler {
  private config: SchedulerConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPaused = false;
  private queue: JobQueue;
  private executor: JobExecutor;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.queue = new JobQueue();
    this.executor = new JobExecutor(
      this.config.defaultTimeoutMs,
      this.config.defaultRetryCount
    );

    // 注册任务处理器
    this.executor.registerHandler('capture_keyword', handleCaptureJob);
    this.executor.registerHandler('capture_theme', handleCaptureJob);
    this.executor.registerHandler('daily_generate', handleDailyGenerateJob);
  }

  // 启动调度器
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    // 恢复待执行任务
    this.queue.loadPendingFromDb();

    // 启动定时检查
    this.timer = setInterval(() => this.tick(), this.config.checkIntervalMs);
    this.tick(); // 立即执行一次
  }

  // 停止调度器
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.isPaused = false;
  }

  // 暂停调度
  pause(): void {
    this.isPaused = true;
  }

  // 恢复调度
  resume(): void {
    this.isPaused = false;
  }

  // 获取状态
  getStatus(): SchedulerStatus {
    const db = getDatabase();
    const nextJob = db.prepare(`
      SELECT next_run_at FROM scheduled_jobs
      WHERE is_enabled = 1 AND next_run_at IS NOT NULL
      ORDER BY next_run_at ASC LIMIT 1
    `).get() as { next_run_at: string } | undefined;

    return {
      running: this.isRunning,
      paused: this.isPaused,
      queueSize: this.queue.size(),
      activeJobs: this.queue.processingCount(),
      nextExecution: nextJob?.next_run_at || null,
    };
  }

  // 定时检查
  private async tick(): Promise<void> {
    if (this.isPaused) return;

    // 检查到期任务
    await this.checkDueJobs();

    // 处理队列
    await this.processQueue();
  }

  // 检查到期任务
  private async checkDueJobs(): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const dueJobs = db.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE is_enabled = 1 AND next_run_at <= ?
      ORDER BY priority ASC, next_run_at ASC
    `).all(now) as ScheduledJob[];

    for (const job of dueJobs) {
      await this.enqueueJob(job, 'scheduled');
    }
  }

  // 将任务加入队列
  private async enqueueJob(job: ScheduledJob, triggerType: TriggerType): Promise<number> {
    const db = getDatabase();

    // 创建执行记录
    const result = db.prepare(`
      INSERT INTO job_executions (job_id, status, trigger_type)
      VALUES (?, 'pending', ?)
    `).run(job.id, triggerType);

    const executionId = result.lastInsertRowid as number;

    // 更新下次执行时间
    const nextRun = getNextRunTime(
      job.schedule_type,
      job.interval_minutes,
      job.cron_expression
    );
    db.prepare(`
      UPDATE scheduled_jobs SET next_run_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextRun.toISOString(), job.id);

    // 加入队列
    this.queue.enqueue({
      executionId,
      jobId: job.id,
      priority: job.priority,
      scheduledAt: new Date(),
      retryCount: 0,
    });

    return executionId;
  }

  // 处理队列
  private async processQueue(): Promise<void> {
    if (this.queue.processingCount() >= this.config.maxConcurrent) return;

    const item = this.queue.dequeue();
    if (!item) return;

    const db = getDatabase();
    const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
      .get(item.jobId) as ScheduledJob | undefined;
    const execution = db.prepare('SELECT * FROM job_executions WHERE id = ?')
      .get(item.executionId) as JobExecution | undefined;

    if (!job || !execution) {
      this.queue.markComplete(item.executionId);
      return;
    }

    // 异步执行
    this.executor.execute(execution, job).then(result => {
      this.queue.markComplete(item.executionId);

      // 失败重试
      if (!result.success && item.retryCount < this.config.defaultRetryCount) {
        this.scheduleRetry(job, item.retryCount + 1);
      }
    });
  }

  // 安排重试
  private scheduleRetry(job: ScheduledJob, retryCount: number): void {
    const db = getDatabase();
    const delay = Math.min(1000 * Math.pow(2, retryCount), 60000);

    setTimeout(() => {
      const result = db.prepare(`
        INSERT INTO job_executions (job_id, status, trigger_type, retry_count)
        VALUES (?, 'pending', 'retry', ?)
      `).run(job.id, retryCount);

      this.queue.enqueue({
        executionId: result.lastInsertRowid as number,
        jobId: job.id,
        priority: job.priority,
        scheduledAt: new Date(),
        retryCount,
      });
    }, delay);
  }

  // 手动触发任务
  async triggerJob(jobId: number): Promise<number> {
    const db = getDatabase();
    const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
      .get(jobId) as ScheduledJob | undefined;

    if (!job) throw new Error('任务不存在');
    return this.enqueueJob(job, 'manual');
  }

  // 取消执行
  cancelExecution(executionId: number): boolean {
    return this.executor.cancel(executionId);
  }
}

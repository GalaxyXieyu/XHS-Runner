// 调度器核心 - 管理定时任务的调度和执行

import { getDatabase } from '../../db';
import {
  ScheduledJob,
  JobExecution,
  SchedulerConfig,
  SchedulerStatus,
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
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    // 恢复待执行任务
    await this.queue.loadPendingFromDb();

    // 启动定时检查
    this.timer = setInterval(() => {
      void this.tick().catch((err) => console.error('[scheduler] tick error:', err));
    }, this.config.checkIntervalMs);
    void this.tick().catch((err) => console.error('[scheduler] tick error:', err));
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
  async getStatus(): Promise<SchedulerStatus> {
    const db = getDatabase();

    const { data: nextJob } = await db
      .from('scheduled_jobs')
      .select('next_run_at')
      .eq('is_enabled', 1)
      .not('next_run_at', 'is', null)
      .order('next_run_at', { ascending: true })
      .limit(1)
      .maybeSingle();

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

    const { data: dueJobs, error } = await db
      .from('scheduled_jobs')
      .select('*')
      .eq('is_enabled', 1)
      .lte('next_run_at', now)
      .order('priority', { ascending: true })
      .order('next_run_at', { ascending: true });

    if (error) {
      console.error('[scheduler] checkDueJobs error:', error);
      return;
    }

    for (const job of (dueJobs || []) as ScheduledJob[]) {
      await this.enqueueJob(job, 'scheduled');
    }
  }

  // 将任务加入队列
  private async enqueueJob(job: ScheduledJob, triggerType: TriggerType): Promise<number> {
    const db = getDatabase();

    // 创建执行记录
    const { data: execData, error: execError } = await db
      .from('job_executions')
      .insert({ job_id: job.id, status: 'pending', trigger_type: triggerType })
      .select('id')
      .single();

    if (execError) throw execError;
    const executionId = Number(execData.id);

    // 更新下次执行时间
    const nextRun = getNextRunTime(
      job.schedule_type,
      job.interval_minutes,
      job.cron_expression
    );

    const { error: updateError } = await db
      .from('scheduled_jobs')
      .update({ next_run_at: nextRun.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (updateError) throw updateError;

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

    const { data: job } = await db
      .from('scheduled_jobs')
      .select('*')
      .eq('id', item.jobId)
      .maybeSingle();

    const { data: execution } = await db
      .from('job_executions')
      .select('*')
      .eq('id', item.executionId)
      .maybeSingle();

    if (!job || !execution) {
      this.queue.markComplete(item.executionId);
      return;
    }

    // 异步执行
    this.executor.execute(execution as JobExecution, job as ScheduledJob).then((result) => {
      this.queue.markComplete(item.executionId);

      // 失败重试
      if (!result.success && item.retryCount < this.config.defaultRetryCount) {
        void this.scheduleRetry(job as ScheduledJob, item.retryCount + 1);
      }
    });
  }

  // 安排重试
  private async scheduleRetry(job: ScheduledJob, retryCount: number): Promise<void> {
    const db = getDatabase();
    const delay = Math.min(1000 * Math.pow(2, retryCount), 60000);

    setTimeout(async () => {
      const { data: execData, error } = await db
        .from('job_executions')
        .insert({ job_id: job.id, status: 'pending', trigger_type: 'retry', retry_count: retryCount })
        .select('id')
        .single();

      if (error) {
        console.error('[scheduler] scheduleRetry error:', error);
        return;
      }

      this.queue.enqueue({
        executionId: Number(execData.id),
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

    const { data: job, error } = await db
      .from('scheduled_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;
    if (!job) throw new Error('任务不存在');

    return this.enqueueJob(job as ScheduledJob, 'manual');
  }

  // 取消执行
  cancelExecution(executionId: number): boolean {
    if (this.queue.remove(executionId)) {
      return true;
    }
    return this.executor.cancel(executionId);
  }
}

// 单例
let schedulerInstance: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
  }
  return schedulerInstance;
}

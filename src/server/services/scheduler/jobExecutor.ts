// 任务执行器 - 执行具体任务并处理超时/重试

import { getDatabase } from '../../db';
import { ScheduledJob, JobExecution, ExecutionResult, CaptureJobParams } from './types';
import { getRateLimiter } from './rateLimiter';

export interface ExecutionContext {
  executionId: number;
  jobId: number;
  retryCount: number;
  startedAt: Date;
  abortController: AbortController;
}

export type JobHandler = (
  job: ScheduledJob,
  params: CaptureJobParams,
  context: ExecutionContext
) => Promise<ExecutionResult>;

export class JobExecutor {
  private handlers: Map<string, JobHandler> = new Map();
  private activeExecutions: Map<number, AbortController> = new Map();
  private defaultTimeoutMs: number;
  private defaultRetryCount: number;

  constructor(defaultTimeoutMs = 60000, defaultRetryCount = 3) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.defaultRetryCount = defaultRetryCount;
  }

  // 注册任务处理器
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  // 执行任务
  async execute(execution: JobExecution, job: ScheduledJob): Promise<ExecutionResult> {
    const handler = this.handlers.get(job.job_type);
    if (!handler) {
      return { success: false, error: `未知任务类型: ${job.job_type}`, duration_ms: 0 };
    }

    const params: CaptureJobParams = job.params_json ? JSON.parse(job.params_json) : {};
    const timeoutMs = params.timeoutMs || this.defaultTimeoutMs;
    const abortController = new AbortController();

    this.activeExecutions.set(execution.id, abortController);
    const startTime = Date.now();

    // 更新执行状态为 running
    this.updateExecutionStatus(execution.id, 'running', startTime);

    const context: ExecutionContext = {
      executionId: execution.id,
      jobId: job.id,
      retryCount: execution.retry_count,
      startedAt: new Date(startTime),
      abortController,
    };

    try {
      // 速率限制检查
      const rateLimiter = getRateLimiter();
      await rateLimiter.waitUntilReady('global');
      rateLimiter.recordRequest('global');

      // 执行任务（带超时）
      const result = await this.withTimeout(
        handler(job, params, context),
        timeoutMs,
        abortController.signal
      );

      const duration = Date.now() - startTime;
      this.updateExecutionResult(execution.id, 'success', { ...result, duration_ms: duration });
      this.updateJobStats(job.id, true);

      return { ...result, duration_ms: duration };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error.message || String(error);
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('超时');

      this.updateExecutionResult(execution.id, isTimeout ? 'timeout' : 'failed', {
        success: false,
        error: errorMsg,
        duration_ms: duration,
      });
      this.updateJobStats(job.id, false, errorMsg);

      return { success: false, error: errorMsg, duration_ms: duration };
    } finally {
      this.activeExecutions.delete(execution.id);
    }
  }

  // 取消执行
  cancel(executionId: number): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.updateExecutionStatus(executionId, 'canceled');
      return true;
    }
    return false;
  }

  // 带超时的 Promise
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('执行超时')), timeoutMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('任务已取消'));
      });

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private updateExecutionStatus(id: number, status: string, startTime?: number): void {
    const db = getDatabase();
    if (startTime) {
      db.prepare(`
        UPDATE job_executions SET status = ?, started_at = ? WHERE id = ?
      `).run(status, new Date(startTime).toISOString(), id);
    } else {
      db.prepare('UPDATE job_executions SET status = ? WHERE id = ?').run(status, id);
    }
  }

  private updateExecutionResult(id: number, status: string, result: ExecutionResult): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE job_executions
      SET status = ?, finished_at = ?, duration_ms = ?, result_json = ?, error_message = ?
      WHERE id = ?
    `).run(
      status,
      new Date().toISOString(),
      result.duration_ms,
      JSON.stringify({ total: result.total, inserted: result.inserted }),
      result.error || null,
      id
    );
  }

  private updateJobStats(jobId: number, success: boolean, error?: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (success) {
      db.prepare(`
        UPDATE scheduled_jobs
        SET last_run_at = ?, last_status = 'success', last_error = NULL,
            run_count = run_count + 1, success_count = success_count + 1, updated_at = ?
        WHERE id = ?
      `).run(now, now, jobId);
    } else {
      db.prepare(`
        UPDATE scheduled_jobs
        SET last_run_at = ?, last_status = 'failed', last_error = ?,
            run_count = run_count + 1, fail_count = fail_count + 1, updated_at = ?
        WHERE id = ?
      `).run(now, error || null, now, jobId);
    }
  }
}

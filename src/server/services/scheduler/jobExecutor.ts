// 任务执行器 - 执行具体任务并处理超时/重试

import { getDatabase } from '../../db';
import { ScheduledJob, JobExecution, ExecutionResult, CaptureJobParams, DailyGenerateJobParams } from './types';
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
  params: CaptureJobParams | DailyGenerateJobParams,
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

    // params_json 是 jsonb 类型，Drizzle 会自动反序列化为对象
    // 如果是字符串则 parse，如果已经是对象则直接使用
    const rawParams = job.params_json;
    const params: CaptureJobParams | DailyGenerateJobParams = 
      typeof rawParams === 'string' ? JSON.parse(rawParams) : (rawParams || {});
    const timeoutMs = params.timeoutMs || this.defaultTimeoutMs;
    const abortController = new AbortController();

    this.activeExecutions.set(execution.id, abortController);
    const startTime = Date.now();

    // 更新执行状态为 running
    await this.updateExecutionStatus(execution.id, 'running', startTime);

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
      await rateLimiter.recordRequest('global');

      // 执行任务（带超时）
      const result = await this.withTimeout(
        handler(job, params, context),
        timeoutMs,
        abortController.signal
      );

      const duration = Date.now() - startTime;

      if (result.success) {
        await this.updateExecutionResult(execution.id, 'success', { ...result, duration_ms: duration });
        await this.updateJobStats(job.id, true);
        return { ...result, duration_ms: duration };
      }

      await this.updateExecutionResult(execution.id, 'failed', { ...result, duration_ms: duration });
      await this.updateJobStats(job.id, false, result.error || '任务执行失败');
      return { ...result, duration_ms: duration };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error.message || String(error);
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('超时');

      await this.updateExecutionResult(execution.id, isTimeout ? 'timeout' : 'failed', {
        success: false,
        error: errorMsg,
        duration_ms: duration,
      });
      await this.updateJobStats(job.id, false, errorMsg);

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
      void this.updateExecutionStatus(executionId, 'canceled').catch(() => {});
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

  private async updateExecutionStatus(id: number, status: string, startTime?: number): Promise<void> {
    const db = getDatabase();
    const updateRow: any = { status };
    if (startTime) updateRow.started_at = new Date(startTime).toISOString();
    const { error } = await db.from('job_executions').update(updateRow).eq('id', id);
    if (error) throw error;
  }

  private async updateExecutionResult(id: number, status: string, result: ExecutionResult): Promise<void> {
    const db = getDatabase();
    const finishedAt = new Date().toISOString();
    const resultJson = JSON.stringify({
      success: result.success,
      total: result.total,
      inserted: result.inserted,
      error: result.error,
    });
    const errorMessage = result.error || null;

    const { error } = await db
      .from('job_executions')
      .update({
        status,
        finished_at: finishedAt,
        duration_ms: result.duration_ms,
        result_json: resultJson,
        error_message: errorMessage,
      })
      .eq('id', id);
    if (error) throw error;
  }

  private async updateJobStats(jobId: number, success: boolean, error?: string): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (success) {
      const { data: current, error: currentError } = await db
        .from('scheduled_jobs')
        .select('run_count, success_count')
        .eq('id', jobId)
        .maybeSingle();
      if (currentError) throw currentError;
      const runCount = Number((current as any)?.run_count || 0) + 1;
      const successCount = Number((current as any)?.success_count || 0) + 1;

      const { error: updateError } = await db.from('scheduled_jobs').update({
        last_run_at: now,
        last_status: 'success',
        last_error: null,
        run_count: runCount,
        success_count: successCount,
        updated_at: now,
      }).eq('id', jobId);
      if (updateError) throw updateError;
    } else {
      const { data: current, error: currentError } = await db
        .from('scheduled_jobs')
        .select('run_count, fail_count')
        .eq('id', jobId)
        .maybeSingle();
      if (currentError) throw currentError;
      const runCount = Number((current as any)?.run_count || 0) + 1;
      const failCount = Number((current as any)?.fail_count || 0) + 1;

      const { error: updateError } = await db.from('scheduled_jobs').update({
        last_run_at: now,
        last_status: 'failed',
        last_error: error || null,
        run_count: runCount,
        fail_count: failCount,
        updated_at: now,
      }).eq('id', jobId);
      if (updateError) throw updateError;
    }
  }
}

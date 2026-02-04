// 定时任务调度系统类型定义

// ============ 任务类型 ============

export type JobType = 'capture_theme' | 'capture_keyword' | 'daily_generate';
export type ScheduleType = 'interval' | 'cron';
export type JobStatus = 'success' | 'failed' | 'skipped';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout';
export type TriggerType = 'scheduled' | 'manual' | 'retry';

// ============ 数据库实体 ============

export interface ScheduledJob {
  id: number;
  name: string;
  job_type: JobType;
  theme_id: number | null;
  keyword_id: number | null;
  schedule_type: ScheduleType;
  interval_minutes: number | null;
  cron_expression: string | null;
  params_json: any;
  is_enabled: number;
  priority: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: JobStatus | null;
  last_error: string | null;
  run_count: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

export interface JobExecution {
  id: number;
  job_id: number;
  status: ExecutionStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_json: string | null;
  error_message: string | null;
  retry_count: number;
  trigger_type: TriggerType;
  created_at: string;
}

export interface RateLimitState {
  id: number;
  scope: 'global' | 'keyword' | 'theme';
  scope_id: string | null;
  request_count: number;
  window_start: string;
  last_request_at: string | null;
  is_blocked: number;
  blocked_until: string | null;
  block_reason: string | null;
}

// ============ 任务参数 ============

export interface CaptureJobParams {
  limit?: number;
  retryCount?: number;
  timeoutMs?: number;
}

export interface DailyGenerateJobParams {
  outputCount?: number;
  output_count?: number;
  days?: number;
  goal?: string;
  timeoutMs?: number;
}

// ============ 创建/更新 DTO ============

export interface CreateJobInput {
  name: string;
  job_type: JobType;
  theme_id?: number;
  keyword_id?: number;
  schedule_type: ScheduleType;
  interval_minutes?: number;
  cron_expression?: string;
  params?: CaptureJobParams | DailyGenerateJobParams;
  is_enabled?: boolean;
  priority?: number;
}

export interface UpdateJobInput {
  name?: string;
  schedule_type?: ScheduleType;
  interval_minutes?: number;
  cron_expression?: string;
  params?: CaptureJobParams | DailyGenerateJobParams;
  is_enabled?: boolean;
  priority?: number;
}

// ============ 执行结果 ============

export interface ExecutionResult {
  success: boolean;
  total?: number;
  inserted?: number;
  error?: string;
  duration_ms: number;
}

// ============ 调度器配置 ============

export interface SchedulerConfig {
  checkIntervalMs: number;
  maxConcurrent: number;
  defaultRetryCount: number;
  defaultRetryDelayMs: number;
  defaultTimeoutMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  checkIntervalMs: 30000,
  maxConcurrent: 1,
  defaultRetryCount: 3,
  defaultRetryDelayMs: 1000,
  defaultTimeoutMs: 60000,
};

// 不同任务类型的默认超时配置
// 根据实际测试：单个 idea Agent 执行约 310 秒，使用 1.5x buffer
export const JOB_TYPE_TIMEOUTS: Record<JobType, number> = {
  capture_theme: 120000,     // 2 分钟
  capture_keyword: 60000,    // 1 分钟
  daily_generate: 2400000,   // 40 分钟（5 ideas × 8 分钟/个）
};

// ============ 速率限制配置 ============

export interface RateLimitConfig {
  globalRequestsPerMinute: number;
  minRequestIntervalMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  globalRequestsPerMinute: 10,
  minRequestIntervalMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 60000,
};

// ============ 调度器状态 ============

export interface SchedulerStatus {
  running: boolean;
  paused: boolean;
  queueSize: number;
  activeJobs: number;
  nextExecution: string | null;
}

// ============ 队列项 ============

export interface QueuedJob {
  executionId: number;
  jobId: number;
  priority: number;
  scheduledAt: Date;
  retryCount: number;
}

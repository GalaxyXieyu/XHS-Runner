import type { AutoTask } from '@/features/task-management/types';

export type CaptureJob = {
  id: number;
  name: string;
  job_type: string;
  theme_id: number | null;
  schedule_type: 'interval' | 'cron';
  interval_minutes: number | null;
  cron_expression: string | null;
  is_enabled: number | boolean;
  next_run_at: string | null;
  last_status: string | null;
};

export type GenerationTask = {
  id: number;
  theme_id: number | null;
  status: string;
  prompt: string | null;
  model: string | null;
  progress: number | null;
  started_at: string | null;
  finished_at: string | null;
  result_asset_id: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type JobExecution = {
  id: number;
  job_id: number;
  status: string;
  trigger_type: string;
  duration_ms: number | null;
  result_json: any;
  error_message: string | null;
  created_at: string;
};

export type ThemeSummary = {
  id: string;
  name: string;
};

export type UnifiedScheduleItem =
  | { kind: 'capture'; sortAt: string; job: CaptureJob }
  | { kind: 'daily'; sortAt: string; task: AutoTask };

// 统一执行历史类型
export type UnifiedExecutionType = 'job_execution' | 'generation_task' | 'publish_record';

export type UnifiedExecutionItem = {
  id: number;
  type: UnifiedExecutionType;
  status: string;
  title: string;
  subtitle?: string;
  trigger_type?: string;
  duration_ms?: number | null;
  error_message?: string | null;
  created_at: string;
  finished_at?: string | null;
  // 关联数据
  job_id?: number;
  theme_id?: number | null;
  creative_id?: number | null;
  progress?: number | null;
};

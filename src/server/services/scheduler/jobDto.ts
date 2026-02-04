import { z } from 'zod';
import type { CreateJobInput, UpdateJobInput } from './types';

// Centralize request DTO validation/coercion so:
// - API handlers stay thin
// - tests can target pure functions (no DB / scheduler required)

const scheduleTypeSchema = z.enum(['interval', 'cron']);
const jobTypeSchema = z.enum(['capture_theme', 'capture_keyword', 'daily_generate']);

const createJobSchema = z
  .object({
    name: z.string().min(1),
    job_type: jobTypeSchema,
    theme_id: z.number().int().positive().optional().nullable(),
    keyword_id: z.number().int().positive().optional().nullable(),
    schedule_type: scheduleTypeSchema,
    interval_minutes: z.number().int().positive().optional().nullable(),
    cron_expression: z.string().min(1).optional().nullable(),
    params: z.any().optional(),
    is_enabled: z.boolean().optional(),
    priority: z.number().int().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.schedule_type === 'interval') {
      if (val.interval_minutes == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'interval_minutes is required for interval schedule' });
      }
    }
    if (val.schedule_type === 'cron') {
      if (!val.cron_expression) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cron_expression is required for cron schedule' });
      }
    }
  });

const updateJobSchema = z
  .object({
    name: z.string().min(1).optional(),
    schedule_type: scheduleTypeSchema.optional(),
    interval_minutes: z.number().int().positive().optional().nullable(),
    cron_expression: z.string().min(1).optional().nullable(),
    params: z.any().optional(),
    is_enabled: z.boolean().optional(),
    priority: z.number().int().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.schedule_type === 'interval' && val.interval_minutes == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'interval_minutes is required for interval schedule' });
    }
    if (val.schedule_type === 'cron' && !val.cron_expression) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cron_expression is required for cron schedule' });
    }
  });

export const jobStatusSchema = z.object({
  status: z.enum(['active', 'paused']),
});

export function parseCreateJobInput(body: unknown): CreateJobInput {
  const parsed = createJobSchema.parse(body);
  const out: CreateJobInput = {
    name: parsed.name,
    job_type: parsed.job_type,
    schedule_type: parsed.schedule_type,
    interval_minutes: parsed.interval_minutes ?? undefined,
    cron_expression: parsed.cron_expression ?? undefined,
    params: parsed.params,
    is_enabled: parsed.is_enabled,
    priority: parsed.priority,
  };

  if (parsed.theme_id != null) out.theme_id = parsed.theme_id;
  if (parsed.keyword_id != null) out.keyword_id = parsed.keyword_id;

  return out;
}

export function parseUpdateJobInput(body: unknown): UpdateJobInput {
  const parsed = updateJobSchema.parse(body);
  const out: UpdateJobInput = {
    name: parsed.name,
    schedule_type: parsed.schedule_type,
    interval_minutes: parsed.interval_minutes ?? undefined,
    cron_expression: parsed.cron_expression ?? undefined,
    params: parsed.params,
    is_enabled: parsed.is_enabled,
    priority: parsed.priority,
  };
  return out;
}

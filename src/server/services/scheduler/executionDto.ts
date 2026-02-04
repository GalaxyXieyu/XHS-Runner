import { z } from 'zod';

// Normalize/validate job execution rows returned to the UI.
// This is intentionally tolerant because result_json may be a string (stored JSON)
// or already-decoded depending on DB client.

export const executionRowSchema = z.object({
  id: z.number(),
  job_id: z.number(),
  status: z.string(),
  trigger_type: z.string().optional().nullable(),
  duration_ms: z.number().nullable().optional(),
  result_json: z.any().optional().nullable(),
  error_message: z.string().nullable().optional(),
  created_at: z.string().optional().nullable(),
});

export function parseExecutionResultJson(raw: unknown): { total?: number; inserted?: number; [k: string]: any } | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as any;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeExecutionRow(raw: unknown) {
  const row = executionRowSchema.parse(raw);
  return {
    ...row,
    result_json: parseExecutionResultJson(row.result_json),
  };
}

export function normalizeExecutionList(raw: unknown): Array<ReturnType<typeof normalizeExecutionRow>> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(normalizeExecutionRow);
}

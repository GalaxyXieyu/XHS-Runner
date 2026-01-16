import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/server/supabase';

function parseNumber(value: string | string[] | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseTimeRange(range: string | string[] | undefined) {
  const raw = Array.isArray(range) ? range[0] : range;
  if (!raw || raw === 'all') return null;
  if (raw === '7d' || raw === '7') return 7;
  if (raw === '30d' || raw === '30') return 30;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const jobId = Array.isArray(req.query.jobId) ? req.query.jobId[0] : req.query.jobId;
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const triggerType = Array.isArray(req.query.triggerType) ? req.query.triggerType[0] : req.query.triggerType;
    const limit = parseNumber(req.query.limit, 50, 1, 200);
    const offset = parseNumber(req.query.offset, 0, 0, 10000);
    const timeRange = parseTimeRange(req.query.time_range);

    let query = supabase
      .from('job_executions')
      .select('id, job_id, status, trigger_type, retry_count, started_at, finished_at, duration_ms, result_json, error_message, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (jobId) {
      const parsedJobId = Number(jobId);
      if (Number.isFinite(parsedJobId)) {
        query = query.eq('job_id', parsedJobId);
      }
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (triggerType) {
      query = query.eq('trigger_type', triggerType);
    }
    if (timeRange) {
      const since = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', since.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

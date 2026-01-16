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
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const themeId = Array.isArray(req.query.themeId) ? req.query.themeId[0] : req.query.themeId;
    const limit = parseNumber(req.query.limit, 50, 1, 200);
    const offset = parseNumber(req.query.offset, 0, 0, 10000);
    const timeRange = parseTimeRange(req.query.time_range);

    let query = supabase
      .from('generation_tasks')
      .select('id, theme_id, topic_id, creative_id, status, prompt, model, result_asset_id, result_json, error_message, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (themeId) {
      const parsedThemeId = Number(themeId);
      if (Number.isFinite(parsedThemeId)) {
        query = query.eq('theme_id', parsedThemeId);
      }
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

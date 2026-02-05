import type { NextApiRequest, NextApiResponse } from 'next';
import { getDatabase } from '@/server/db';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const db = getDatabase();
    const limit = parseNumber(req.query.limit, 50, 1, 200);
    const offset = parseNumber(req.query.offset, 0, 0, 10000);
    const timeRange = parseTimeRange(req.query.time_range);
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const typeFilter = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    const includeTotal = req.query.includeTotal === '1' || req.query.includeTotal === 'true';

    const since = timeRange
      ? new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const items: UnifiedExecutionItem[] = [];

    // 1. 获取 job_executions (调度执行记录)
    if (!typeFilter || typeFilter === 'job_execution') {
      let jobExecQuery = db
        .from('job_executions')
        .select('id, job_id, status, trigger_type, duration_ms, error_message, created_at, finished_at')
        .order('created_at', { ascending: false })
        .limit(limit * 2); // 多取一些用于合并排序

      if (since) jobExecQuery = jobExecQuery.gte('created_at', since);
      if (status && status !== 'all') {
        // 状态映射: success/failed/running/pending 对应 job_executions 的状态
        jobExecQuery = jobExecQuery.eq('status', status);
      }

      const { data: jobExecs } = await jobExecQuery;

      // 获取关联的 job 名称
      const jobIds = [...new Set((jobExecs || []).map((e: any) => e.job_id))];
      let jobNames: Record<number, string> = {};
      if (jobIds.length > 0) {
        const { data: jobs } = await db
          .from('scheduled_jobs')
          .select('id, name, job_type')
          .in('id', jobIds);
        jobNames = (jobs || []).reduce((acc: any, j: any) => {
          acc[j.id] = j.name;
          return acc;
        }, {});
      }

      (jobExecs || []).forEach((e: any) => {
        items.push({
          id: e.id,
          type: 'job_execution',
          status: e.status,
          title: jobNames[e.job_id] || `调度任务 #${e.job_id}`,
          subtitle: e.trigger_type === 'manual' ? '手动触发' : '定时执行',
          trigger_type: e.trigger_type,
          duration_ms: e.duration_ms,
          error_message: e.error_message,
          created_at: e.created_at,
          finished_at: e.finished_at,
          job_id: e.job_id,
        });
      });
    }

    // 2. 获取 generation_tasks (生成任务)
    if (!typeFilter || typeFilter === 'generation_task') {
      let genTaskQuery = db
        .from('generation_tasks')
        .select('id, theme_id, creative_id, status, progress, started_at, finished_at, error_message, created_at, prompt')
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (since) genTaskQuery = genTaskQuery.gte('created_at', since);
      if (status && status !== 'all') {
        // 映射状态: generation_tasks 使用 queued/running/completed/failed
        const statusMap: Record<string, string> = {
          pending: 'queued',
          running: 'running',
          success: 'completed',
          failed: 'failed',
        };
        const mappedStatus = statusMap[status] || status;
        genTaskQuery = genTaskQuery.eq('status', mappedStatus);
      }

      const { data: genTasks } = await genTaskQuery;

      (genTasks || []).forEach((t: any) => {
        const durationMs = t.started_at && t.finished_at
          ? new Date(t.finished_at).getTime() - new Date(t.started_at).getTime()
          : null;

        items.push({
          id: t.id,
          type: 'generation_task',
          status: t.status === 'completed' ? 'success' : t.status === 'queued' ? 'pending' : t.status,
          title: t.prompt ? `生成: ${t.prompt.slice(0, 30)}...` : `生成任务 #${t.id}`,
          subtitle: t.progress ? `进度 ${t.progress}%` : undefined,
          duration_ms: durationMs,
          error_message: t.error_message,
          created_at: t.created_at,
          finished_at: t.finished_at,
          theme_id: t.theme_id,
          creative_id: t.creative_id,
          progress: t.progress,
        });
      });
    }

    // 3. 获取 publish_records (发布记录)
    if (!typeFilter || typeFilter === 'publish_record') {
      let pubQuery = db
        .from('publish_records')
        .select('id, theme_id, creative_id, title, status, error_message, created_at, published_at, scheduled_at')
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (since) pubQuery = pubQuery.gte('created_at', since);
      if (status && status !== 'all') {
        // 映射状态: publish_records 使用 queued/publishing/published/failed
        const statusMap: Record<string, string> = {
          pending: 'queued',
          running: 'publishing',
          success: 'published',
          failed: 'failed',
        };
        const mappedStatus = statusMap[status] || status;
        pubQuery = pubQuery.eq('status', mappedStatus);
      }

      const { data: pubRecords } = await pubQuery;

      (pubRecords || []).forEach((p: any) => {
        const durationMs = p.published_at && p.created_at
          ? new Date(p.published_at).getTime() - new Date(p.created_at).getTime()
          : null;

        items.push({
          id: p.id,
          type: 'publish_record',
          status: p.status === 'published' ? 'success' : p.status === 'queued' ? 'pending' : p.status === 'publishing' ? 'running' : p.status,
          title: p.title || `发布任务 #${p.id}`,
          subtitle: p.scheduled_at ? `计划: ${new Date(p.scheduled_at).toLocaleString('zh-CN')}` : undefined,
          duration_ms: durationMs,
          error_message: p.error_message,
          created_at: p.created_at,
          finished_at: p.published_at,
          theme_id: p.theme_id,
          creative_id: p.creative_id,
        });
      });
    }

    // 按时间排序
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 分页
    const paginatedItems = items.slice(offset, offset + limit);
    const total = items.length;

    if (includeTotal) {
      return res.status(200).json({
        items: paginatedItems,
        total,
        limit,
        offset,
      });
    }
    return res.status(200).json(paginatedItems);
  } catch (error: any) {
    console.error('Unified executions error:', error);
    return res.status(500).json({ error: error.message });
  }
}

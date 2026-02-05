import type { AutoTask } from '@/features/task-management/types';
import type { CaptureJob } from './taskCenterTypes';

export const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDuration = (ms: number | null) => {
  if (!ms) return '-';
  return `${(ms / 1000).toFixed(1)}s`;
};

export const getScheduleText = (job: CaptureJob) => {
  if (job.schedule_type === 'interval' && job.interval_minutes) {
    if (job.interval_minutes < 60) return `每${job.interval_minutes}分钟`;
    if (job.interval_minutes % 1440 === 0) {
      const days = job.interval_minutes / 1440;
      return days === 1 ? '每天' : `每${days}天`;
    }
    if (job.interval_minutes % 60 === 0) {
      return `每${job.interval_minutes / 60}小时`;
    }
    const hours = Math.floor(job.interval_minutes / 60);
    const minutes = job.interval_minutes % 60;
    return `每${hours}小时${minutes}分钟`;
  }

  if (job.schedule_type === 'cron' && job.cron_expression) {
    const raw = job.cron_expression.trim();
    const parts = raw.split(/\s+/);
    if (parts.length >= 5) {
      const [min, hour, dayOfMonth, month, dayOfWeek] = parts;
      const mm = String(min).padStart(2, '0');
      const hh = String(hour).padStart(2, '0');
      if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return `每日 ${hh}:${mm}`;
      }
      if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const map: Record<string, string> = {
          '0': '日',
          '1': '一',
          '2': '二',
          '3': '三',
          '4': '四',
          '5': '五',
          '6': '六',
          '7': '日',
        };
        const label = map[dayOfWeek] || dayOfWeek;
        return `每周${label} ${hh}:${mm}`;
      }
    }
  }

  return job.cron_expression || '-';
};

export const promptProfiles = [
  { id: '1', name: '通用图文-收藏优先' },
  { id: '2', name: '种草文案模板' },
  { id: '3', name: '评论互动回复' },
] as const;

export const mapJobToAutoTask = (job: any): AutoTask => ({
  id: String(job.id),
  themeId: job.theme_id ?? undefined,
  name: job.name || job.description || '未命名任务',
  schedule: job.schedule || '手动执行',
  config: {
    goal: (job.config?.goal as AutoTask['config']['goal']) || 'collects',
    persona: job.config?.persona || '25-35岁职场女性',
    tone: job.config?.tone || '干货/亲和',
    promptProfileId: job.config?.prompt_profile_id || '1',
    imageModel: (job.config?.image_model as AutoTask['config']['imageModel']) || 'nanobanana',
    outputCount: job.config?.output_count || 5,
    minQualityScore: job.config?.min_quality_score || 70,
  },
  status: job.is_enabled ? 'active' : 'paused',
  lastRunAt: job.last_run_at,
  nextRunAt: job.next_run_at || new Date().toISOString(),
  totalRuns: job.total_runs || 0,
  successfulRuns: job.successful_runs || 0,
});

export const getStatusText = (status: string) => {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '生成中';
    case 'completed':
    case 'done':
      return '已完成';
    case 'failed':
      return '失败';
    case 'paused':
      return '已暂停';
    default:
      return status || '-';
  }
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-700';
    case 'queued':
      return 'bg-gray-100 text-gray-600';
    case 'completed':
    case 'done':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'paused':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export const getExecutionStatusText = (status: string) => {
  switch (status) {
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
    case 'running':
      return '执行中';
    case 'pending':
      return '等待';
    case 'canceled':
      return '已取消';
    case 'timeout':
      return '超时';
    default:
      return status || '-';
  }
};

export const getExecutionStatusColor = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-green-100 text-green-700';
    case 'failed':
    case 'timeout':
      return 'bg-red-100 text-red-700';
    case 'running':
      return 'bg-blue-100 text-blue-700';
    case 'canceled':
      return 'bg-gray-200 text-gray-600';
    default:
      return 'bg-yellow-100 text-yellow-700';
  }
};

export const calculateDuration = (startedAt?: string | null, finishedAt?: string | null) => {
  if (!startedAt || !finishedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '-';
  const diff = Math.floor((end - start) / 1000);
  if (diff < 60) return `${diff}s`;
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  if (minutes < 60) return `${minutes}m${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h${remainMinutes}m`;
};

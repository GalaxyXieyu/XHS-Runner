// 任务状态样式（生成任务）
export const TASK_STATUS_STYLES = {
  queued: { bg: 'bg-gray-100', text: 'text-gray-600', label: '排队中', dot: 'bg-gray-400' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '生成中', dot: 'bg-blue-500 animate-pulse' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: '已完成', dot: 'bg-green-500' },
  done: { bg: 'bg-green-100', text: 'text-green-700', label: '已完成', dot: 'bg-green-500' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: '失败', dot: 'bg-red-500' },
} as const;

// 执行状态样式
export const EXECUTION_STATUS_STYLES = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '等待', dot: 'bg-yellow-500' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '执行中', dot: 'bg-blue-500 animate-pulse' },
  success: { bg: 'bg-green-100', text: 'text-green-700', label: '成功', dot: 'bg-green-500' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: '失败', dot: 'bg-red-500' },
  canceled: { bg: 'bg-gray-200', text: 'text-gray-600', label: '已取消', dot: 'bg-gray-400' },
  timeout: { bg: 'bg-red-100', text: 'text-red-700', label: '超时', dot: 'bg-red-500' },
} as const;

// 调度任务启用状态样式
export const JOB_ENABLED_STYLES = {
  enabled: { bg: 'bg-green-50', text: 'text-green-700', label: '启用中', dot: 'bg-green-500 animate-pulse' },
  paused: { bg: 'bg-gray-100', text: 'text-gray-600', label: '已暂停', dot: 'bg-gray-400' },
} as const;

// 任务类型标签样式
export const TASK_TYPE_STYLES = {
  capture: { bg: 'bg-indigo-50', text: 'text-indigo-600', label: '抓取' },
  daily_generate: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: '定时生成' },
} as const;

// 统一执行历史类型标签样式
export const UNIFIED_EXECUTION_TYPE_STYLES = {
  job_execution: { bg: 'bg-indigo-50', text: 'text-indigo-600', label: '调度执行' },
  generation_task: { bg: 'bg-violet-50', text: 'text-violet-600', label: '内容生成' },
  publish_record: { bg: 'bg-rose-50', text: 'text-rose-600', label: '发布' },
} as const;

// 获取状态样式
export function getTaskStatusStyle(status: string) {
  return TASK_STATUS_STYLES[status as keyof typeof TASK_STATUS_STYLES] || {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: status,
    dot: 'bg-gray-400',
  };
}

export function getExecutionStatusStyle(status: string) {
  return EXECUTION_STATUS_STYLES[status as keyof typeof EXECUTION_STATUS_STYLES] || {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: status,
    dot: 'bg-gray-400',
  };
}

export function getJobEnabledStyle(enabled: boolean) {
  return enabled ? JOB_ENABLED_STYLES.enabled : JOB_ENABLED_STYLES.paused;
}

export function getTaskTypeStyle(type: 'capture' | 'daily_generate') {
  return TASK_TYPE_STYLES[type];
}

export function getUnifiedExecutionTypeStyle(type: string) {
  return UNIFIED_EXECUTION_TYPE_STYLES[type as keyof typeof UNIFIED_EXECUTION_TYPE_STYLES] || {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    label: type,
  };
}

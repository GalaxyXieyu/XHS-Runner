// 任务状态样式（生成任务）
export const TASK_STATUS_STYLES = {
  queued: { bg: 'bg-gray-100', text: 'text-gray-600', label: '排队中' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '生成中' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: '已完成' },
  done: { bg: 'bg-green-100', text: 'text-green-700', label: '已完成' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: '失败' },
} as const;

// 执行状态样式
export const EXECUTION_STATUS_STYLES = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '等待' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '执行中' },
  success: { bg: 'bg-green-100', text: 'text-green-700', label: '成功' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: '失败' },
  canceled: { bg: 'bg-gray-200', text: 'text-gray-600', label: '已取消' },
  timeout: { bg: 'bg-red-100', text: 'text-red-700', label: '超时' },
} as const;

// 调度任务启用状态样式
export const JOB_ENABLED_STYLES = {
  enabled: { bg: 'bg-green-100', text: 'text-green-700', label: '启用中' },
  paused: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '已暂停' },
} as const;

// 任务类型标签样式
export const TASK_TYPE_STYLES = {
  capture: { bg: 'bg-indigo-50', text: 'text-indigo-600', label: '抓取' },
  daily_generate: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: '定时生成' },
} as const;

// 获取状态样式
export function getTaskStatusStyle(status: string) {
  return TASK_STATUS_STYLES[status as keyof typeof TASK_STATUS_STYLES] || {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: status,
  };
}

export function getExecutionStatusStyle(status: string) {
  return EXECUTION_STATUS_STYLES[status as keyof typeof EXECUTION_STATUS_STYLES] || {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: status,
  };
}

export function getJobEnabledStyle(enabled: boolean) {
  return enabled ? JOB_ENABLED_STYLES.enabled : JOB_ENABLED_STYLES.paused;
}

export function getTaskTypeStyle(type: 'capture' | 'daily_generate') {
  return TASK_TYPE_STYLES[type];
}

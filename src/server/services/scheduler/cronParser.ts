// Cron 表达式解析器 - 计算下次执行时间

import { CronExpressionParser } from 'cron-parser';

export interface NextRunResult {
  nextRun: Date;
  description: string;
}

// 计算下次执行时间
export function getNextRunTime(
  scheduleType: 'interval' | 'cron',
  intervalMinutes?: number | null,
  cronExpression?: string | null,
  fromDate?: Date
): Date {
  const now = fromDate || new Date();

  if (scheduleType === 'interval' && intervalMinutes) {
    return new Date(now.getTime() + intervalMinutes * 60 * 1000);
  }

  if (scheduleType === 'cron' && cronExpression) {
    try {
      const interval = CronExpressionParser.parse(cronExpression, { currentDate: now });
      return interval.next().toDate();
    } catch {
      // 解析失败，默认 1 小时后
      return new Date(now.getTime() + 60 * 60 * 1000);
    }
  }

  // 默认 30 分钟后
  return new Date(now.getTime() + 30 * 60 * 1000);
}

// 验证 cron 表达式
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    CronExpressionParser.parse(expression);
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

// 获取 cron 表达式的人类可读描述
export function describeCronExpression(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return '无效的 cron 表达式';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 简单的描述逻辑
  if (minute.startsWith('*/') && hour === '*') {
    const mins = parseInt(minute.slice(2));
    return `每 ${mins} 分钟`;
  }

  if (hour.startsWith('*/') && minute === '0') {
    const hours = parseInt(hour.slice(2));
    return `每 ${hours} 小时`;
  }

  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*') {
    if (dayOfWeek === '*') {
      return `每天 ${hour}:${minute.padStart(2, '0')}`;
    }
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayNum = parseInt(dayOfWeek);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      return `每${days[dayNum]} ${hour}:${minute.padStart(2, '0')}`;
    }
  }

  return expression;
}

// 常用 cron 表达式预设
export const CRON_PRESETS = [
  { label: '每 15 分钟', value: '*/15 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每天 8:00', value: '0 8 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 20:00', value: '0 20 * * *' },
];

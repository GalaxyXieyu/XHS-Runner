// 任务队列 - 管理待执行的任务

import { getDatabase } from '../../db';
import { QueuedJob, ScheduledJob, JobExecution } from './types';

export class JobQueue {
  private queue: QueuedJob[] = [];
  private processing: Set<number> = new Set();

  // 从数据库加载待执行任务
  loadPendingFromDb(): void {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT * FROM job_executions WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as JobExecution[];

    for (const exec of pending) {
      const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(exec.job_id) as ScheduledJob;
      if (job) {
        this.queue.push({
          executionId: exec.id,
          jobId: exec.job_id,
          priority: job.priority,
          scheduledAt: new Date(exec.created_at),
          retryCount: exec.retry_count,
        });
      }
    }
    this.sortQueue();
  }

  // 添加任务到队列
  enqueue(item: QueuedJob): void {
    this.queue.push(item);
    this.sortQueue();
  }

  // 取出优先级最高的任务
  dequeue(): QueuedJob | null {
    if (this.queue.length === 0) return null;
    const item = this.queue.shift()!;
    this.processing.add(item.executionId);
    return item;
  }

  // 查看队首任务
  peek(): QueuedJob | null {
    return this.queue[0] || null;
  }

  // 移除任务
  remove(executionId: number): boolean {
    const idx = this.queue.findIndex(q => q.executionId === executionId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  // 标记任务完成
  markComplete(executionId: number): void {
    this.processing.delete(executionId);
  }

  // 队列大小
  size(): number {
    return this.queue.length;
  }

  // 是否正在处理
  isProcessing(executionId: number): boolean {
    return this.processing.has(executionId);
  }

  // 正在处理的数量
  processingCount(): number {
    return this.processing.size;
  }

  // 获取统计
  getStats(): { queued: number; processing: number } {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
    };
  }

  // 清空队列
  clear(): void {
    this.queue = [];
    this.processing.clear();
  }

  // 按优先级排序
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });
  }
}

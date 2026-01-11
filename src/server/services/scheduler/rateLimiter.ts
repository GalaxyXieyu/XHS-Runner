// 速率限制器 - 防止请求过于频繁和被封禁

import { getDatabase } from '../../db';
import { RateLimitState, RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from './types';

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  // 检查是否可以执行请求
  canExecute(scope: string, scopeId?: string): boolean {
    if (this.isBlocked(scope, scopeId)) {
      return false;
    }
    const waitTime = this.getWaitTime(scope, scopeId);
    return waitTime <= 0;
  }

  // 获取需要等待的时间(ms)
  getWaitTime(scope: string, scopeId?: string): number {
    const db = getDatabase();
    const state = db.prepare(
      'SELECT * FROM rate_limit_state WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))'
    ).get(scope, scopeId || null, scopeId || null) as RateLimitState | undefined;

    if (!state) return 0;

    const now = Date.now();
    const lastRequest = state.last_request_at ? new Date(state.last_request_at).getTime() : 0;
    const elapsed = now - lastRequest;

    if (elapsed < this.config.minRequestIntervalMs) {
      return this.config.minRequestIntervalMs - elapsed;
    }

    return 0;
  }

  // 记录一次请求
  recordRequest(scope: string, scopeId?: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    const windowStart = new Date(Date.now() - 60000).toISOString(); // 1分钟窗口

    const existing = db.prepare(
      'SELECT * FROM rate_limit_state WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))'
    ).get(scope, scopeId || null, scopeId || null) as RateLimitState | undefined;

    if (existing) {
      // 检查是否需要重置窗口
      const windowStartTime = new Date(existing.window_start).getTime();
      if (Date.now() - windowStartTime > 60000) {
        // 重置窗口
        db.prepare(`
          UPDATE rate_limit_state
          SET request_count = 1, window_start = ?, last_request_at = ?
          WHERE id = ?
        `).run(now, now, existing.id);
      } else {
        // 增加计数
        db.prepare(`
          UPDATE rate_limit_state
          SET request_count = request_count + 1, last_request_at = ?
          WHERE id = ?
        `).run(now, existing.id);
      }
    } else {
      db.prepare(`
        INSERT INTO rate_limit_state (scope, scope_id, request_count, window_start, last_request_at)
        VALUES (?, ?, 1, ?, ?)
      `).run(scope, scopeId || null, now, now);
    }
  }

  // 检查是否被封禁
  isBlocked(scope: string, scopeId?: string): boolean {
    const db = getDatabase();
    const state = db.prepare(
      'SELECT * FROM rate_limit_state WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))'
    ).get(scope, scopeId || null, scopeId || null) as RateLimitState | undefined;

    if (!state || !state.is_blocked) return false;

    if (state.blocked_until) {
      const blockedUntil = new Date(state.blocked_until).getTime();
      if (Date.now() > blockedUntil) {
        // 封禁已过期，自动解除
        this.unblock(scope, scopeId);
        return false;
      }
    }

    return true;
  }

  // 封禁
  block(scope: string, scopeId: string | undefined, reason: string, durationMs: number): void {
    const db = getDatabase();
    const blockedUntil = new Date(Date.now() + durationMs).toISOString();

    const existing = db.prepare(
      'SELECT id FROM rate_limit_state WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))'
    ).get(scope, scopeId || null, scopeId || null);

    if (existing) {
      db.prepare(`
        UPDATE rate_limit_state
        SET is_blocked = 1, blocked_until = ?, block_reason = ?
        WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))
      `).run(blockedUntil, reason, scope, scopeId || null, scopeId || null);
    } else {
      db.prepare(`
        INSERT INTO rate_limit_state (scope, scope_id, request_count, window_start, is_blocked, blocked_until, block_reason)
        VALUES (?, ?, 0, datetime('now'), 1, ?, ?)
      `).run(scope, scopeId || null, blockedUntil, reason);
    }
  }

  // 解除封禁
  unblock(scope: string, scopeId?: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE rate_limit_state
      SET is_blocked = 0, blocked_until = NULL, block_reason = NULL
      WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))
    `).run(scope, scopeId || null, scopeId || null);
  }

  // 计算指数退避延迟
  getBackoffDelay(retryCount: number): number {
    const delay = this.config.minRequestIntervalMs * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxBackoffMs);
  }

  // 等待直到可以执行
  async waitUntilReady(scope: string, scopeId?: string): Promise<void> {
    const waitTime = this.getWaitTime(scope, scopeId);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // 获取状态
  getStatus(): { global: RateLimitState | null; blocked: RateLimitState[] } {
    const db = getDatabase();
    const global = db.prepare(
      "SELECT * FROM rate_limit_state WHERE scope = 'global'"
    ).get() as RateLimitState | undefined;

    const blocked = db.prepare(
      'SELECT * FROM rate_limit_state WHERE is_blocked = 1'
    ).all() as RateLimitState[];

    return { global: global || null, blocked };
  }
}

// 单例
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

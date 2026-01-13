// 速率限制器 - 防止请求过于频繁和被封禁

import { RateLimitState, RateLimitConfig, DEFAULT_RATE_LIMIT_CONFIG } from './types';

export class RateLimiter {
  private config: RateLimitConfig;
  private memoryState: Map<string, RateLimitState> = new Map();
  private nextId = 1;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  private getStateKey(scope: string, scopeId?: string) {
    return `${scope}::${scopeId || ''}`;
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
    const state = this.memoryState.get(this.getStateKey(scope, scopeId));
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
  async recordRequest(scope: string, scopeId?: string): Promise<void> {
    const now = new Date().toISOString();
    const key = this.getStateKey(scope, scopeId);
    const existing = this.memoryState.get(key);

    if (existing) {
      // 检查是否需要重置窗口
      const windowStartTime = new Date(existing.window_start).getTime();
      if (Date.now() - windowStartTime > 60000) {
        // 重置窗口
        this.memoryState.set(key, {
          ...existing,
          request_count: 1,
          window_start: now,
          last_request_at: now,
        });
      } else {
        // 增加计数
        this.memoryState.set(key, {
          ...existing,
          request_count: existing.request_count + 1,
          last_request_at: now,
        });
      }
    } else {
      this.memoryState.set(key, {
        id: this.nextId++,
        scope: scope as any,
        scope_id: scopeId || null,
        request_count: 1,
        window_start: now,
        last_request_at: now,
        is_blocked: 0,
        blocked_until: null,
        block_reason: null,
      });
    }
  }

  // 检查是否被封禁
  isBlocked(scope: string, scopeId?: string): boolean {
    const state = this.memoryState.get(this.getStateKey(scope, scopeId));
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
    const blockedUntil = new Date(Date.now() + durationMs).toISOString();
    const key = this.getStateKey(scope, scopeId);
    const existing = this.memoryState.get(key);

    if (existing) {
      this.memoryState.set(key, {
        ...existing,
        is_blocked: 1,
        blocked_until: blockedUntil,
        block_reason: reason,
      });
    } else {
      this.memoryState.set(key, {
        id: this.nextId++,
        scope: scope as any,
        scope_id: scopeId || null,
        request_count: 0,
        window_start: new Date().toISOString(),
        last_request_at: null,
        is_blocked: 1,
        blocked_until: blockedUntil,
        block_reason: reason,
      });
    }
  }

  // 解除封禁
  unblock(scope: string, scopeId?: string): void {
    const key = this.getStateKey(scope, scopeId);
    const existing = this.memoryState.get(key);
    if (!existing) return;
    this.memoryState.set(key, { ...existing, is_blocked: 0, blocked_until: null, block_reason: null });
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
    const global = this.memoryState.get(this.getStateKey('global')) || null;
    const blocked = Array.from(this.memoryState.values()).filter((s) => Boolean(s.is_blocked));
    return { global, blocked };
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

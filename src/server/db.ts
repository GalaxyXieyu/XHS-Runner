// Database access layer - Supabase SDK for backward compatibility
// Drizzle ORM 导出用于渐进迁移（目前仅提供类型/占位实现）

export { db, schema } from './db/index';

// Legacy database helper - for gradual migration
import { supabase } from './supabase';

export function initializeDatabase() {
  // 当前运行模式默认使用 Supabase（Electron/Next 共用），这里保持幂等即可
  // eslint-disable-next-line no-console
  console.log('Using Supabase database');
}

export function getDatabase() {
  return supabase;
}

// Re-export Supabase client
export { supabase };

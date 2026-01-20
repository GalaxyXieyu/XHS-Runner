/**
 * PostgreSQL 直接连接客户端
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || '';
    if (!connectionString) {
      throw new Error('DATABASE_URL not configured');
    }
    pool = new Pool({
      connectionString,
      // 优化配置
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10秒连接超时
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const client = getPool();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch (error) {
    console.error('[pg] Query error:', error);
    throw error;
  }
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  try {
    const rows = await query<T>(sql, params);
    return rows[0] || null;
  } catch (error) {
    console.error('[pg] QueryOne error:', error);
    throw error;
  }
}

// 关闭池连接
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

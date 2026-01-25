import * as schema from './schema';

export { schema };

// Drizzle ORM 连接层（Postgres）
// - 使用 `DATABASE_URL` 连接 Postgres（支持本地/托管连接串）
// - 可选 `SUPABASE_DB_URL` 仅用于迁移导出脚本
// - 采用惰性初始化，避免未配置时影响未使用 Drizzle 的路径
import postgres, { Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function resolveDatabaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    null
  );
}

function createError(): Error {
  return new Error(
    'Drizzle db is not configured. Please set DATABASE_URL (Postgres connection string) in your environment.'
  );
}

function getGlobalCache(): {
  __xhsSql?: Sql;
  __xhsDrizzle?: DrizzleDb;
} {
  return globalThis as any;
}

export function getDrizzleDb(): DrizzleDb {
  const url = resolveDatabaseUrl();
  if (!url) throw createError();

  const globalCache = getGlobalCache();
  if (!globalCache.__xhsSql) {
    globalCache.__xhsSql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  if (!globalCache.__xhsDrizzle) {
    globalCache.__xhsDrizzle = drizzle(globalCache.__xhsSql, { schema });
  }
  return globalCache.__xhsDrizzle;
}

// `db` 仍保持原导出形态：使用时才初始化/抛错
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const real = getDrizzleDb() as any;
      return real[prop as any];
    },
  }
) as any;

import * as schema from './schema';

export { schema };

// NOTE: 目前项目主要走 Supabase SDK（见 `src/server/db.ts` -> `getDatabase()`）。
// Drizzle 连接层尚未配置（缺少 pg/postgres-js 等 driver 依赖），这里先导出一个惰性占位，
// 避免 Next.js 类型检查在导出层报错；一旦真正调用会抛出明确异常，便于后续接入时发现。
export const db = new Proxy(
  {},
  {
    get() {
      throw new Error('Drizzle db is not configured yet. Use getDatabase() (Supabase) for now.');
    },
  }
) as any;


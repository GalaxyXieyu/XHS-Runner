import { sql, type SQL } from 'drizzle-orm';
import { db } from './index';

type SqlExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export async function ensureKeywordSequence(executor: SqlExecutor = db) {
  await executor.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('keywords', 'id'),
      COALESCE((SELECT MAX(id) FROM keywords), 0) + 1,
      false
    )
  `);
}

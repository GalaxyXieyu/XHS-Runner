// Database access layer
// - Drizzle ORM: new code should use `db`/`schema`
// - Query client: legacy query helpers backed by Drizzle

export { db, schema } from './db/index';
import { getDrizzleDb } from './db/index';
import { getQueryClient } from './db/queryClient';

export function initializeDatabase() {
  // Ensure Drizzle is configured early (Electron/Next 共用)
  getDrizzleDb();
  // eslint-disable-next-line no-console
  console.log('Using Drizzle ORM database');
}

export function getDatabase() {
  // Legacy: prefer `db` for new code
  return getQueryClient();
}

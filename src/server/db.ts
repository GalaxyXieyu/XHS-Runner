// Database access layer
// - Drizzle ORM: new code should use `db`/`schema`
// - Supabase SDK: legacy compatibility for modules not yet migrated

export { db, schema } from './db/index';
import { getDrizzleDb } from './db/index';

// Legacy database helper - for gradual migration
import { supabase } from './supabase';

export function initializeDatabase() {
  // Ensure Drizzle is configured early (Electron/Next 共用)
  getDrizzleDb();
  // eslint-disable-next-line no-console
  console.log('Using Drizzle ORM database');
}

export function getDatabase() {
  // Legacy: prefer `db` for new code
  return supabase;
}

// Re-export Supabase client
export { supabase };

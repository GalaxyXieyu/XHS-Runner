import { supabase } from './supabase';
import { getSqliteDatabase, initializeSqliteDatabase } from './db/sqlite';

export type DbProvider = 'sqlite' | 'supabase';

export function getDbProvider(): DbProvider {
  const raw = String(process.env.XHS_DB_PROVIDER || 'supabase').trim().toLowerCase();
  return raw === 'sqlite' ? 'sqlite' : 'supabase';
}

export function initializeDatabase() {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    initializeSqliteDatabase();
    return;
  }
  console.log('Using Supabase - no local initialization needed');
}

export function getDatabase(): any {
  const provider = getDbProvider();
  if (provider === 'sqlite') {
    return getSqliteDatabase();
  }
  return supabase;
}

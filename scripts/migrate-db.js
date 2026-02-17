#!/usr/bin/env node
/**
 * Production DB migration runner (plain JS).
 *
 * This avoids needing tsx/TypeScript in the runtime Docker image.
 */

const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL/POSTGRES_URL is required');
    process.exit(1);
  }

  console.log('[migrate] start');
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('[migrate] done');
    await migrationClient.end();
  } catch (err) {
    console.error('[migrate] failed', err);
    await migrationClient.end();
    process.exit(1);
  }
}

main();

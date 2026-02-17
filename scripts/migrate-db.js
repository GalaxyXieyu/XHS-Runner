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
    const msg = (err && (err.message || String(err))) || '';

    // Some repos keep historical migrations out of git (or they were created manually on prod).
    // If the image lacks the old SQL files but the DB schema is already present, don't crash-loop.
    const isMissingMigrationFile = msg.includes('No file ./drizzle/');
    const strict = process.env.MIGRATE_STRICT === '1';

    if (isMissingMigrationFile && !strict) {
      console.warn('[migrate] missing migration files in image; skipping migrations (set MIGRATE_STRICT=1 to fail)');
      console.warn('[migrate] error:', msg);
      await migrationClient.end();
      return;
    }

    console.error('[migrate] failed', err);
    await migrationClient.end();
    process.exit(1);
  }
}

main();

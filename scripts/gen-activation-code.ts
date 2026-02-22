#!/usr/bin/env node
/**
 * Generate activation codes for the web UI.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/gen-activation-code.ts --count 5
 *   node scripts/gen-activation-code.ts --count 1   # prints only (no insert)
 */

import crypto from 'crypto';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { count: number } = { count: 1 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') out.count = Number(args[i + 1] || '1');
  }
  if (!Number.isFinite(out.count) || out.count <= 0) out.count = 1;
  return out;
}

function makeCode() {
  // Human-friendly enough, still high entropy.
  return crypto.randomBytes(9).toString('base64url');
}

async function main() {
  const { count } = parseArgs();
  const codes = Array.from({ length: count }, makeCode);

  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    // Print only.
    console.log(codes.join('\n'));
    return;
  }

  // Lazy import to avoid requiring DB deps when printing only.
  const postgres = (await import('postgres')).default;
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { schema } = await import('../src/server/db');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema: schema as any });

  // Insert activation codes (ignore duplicates).
  for (const code of codes) {
    await (db as any)
      .insert((schema as any).appActivationCodes)
      .values({ code })
      .onConflictDoNothing();
  }

  await client.end();
  console.log(codes.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

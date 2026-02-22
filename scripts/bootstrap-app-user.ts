#!/usr/bin/env node
/*
Bootstrap a local app user for the web UI:
- Ensure APP_AUTH_SECRET exists (append to .env.local if missing)
- Generate an activation code and insert into DB
- Create a user using that activation code

Usage:
  npx tsx scripts/bootstrap-app-user.ts
  APP_USER_EMAIL=me@example.com APP_USER_PASSWORD=pass npx tsx scripts/bootstrap-app-user.ts

Notes:
- Requires DATABASE_URL (loaded from .env.local)
- Prints credentials to stdout for local use
*/

import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Load .env.local explicitly for local bootstrap scripts.
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { and, eq, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import { db, schema } from '@/server/db';
import { createUserWithActivationCode } from '@/server/auth/appAuth';

function randSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function ensureAppAuthSecret() {
  if (process.env.APP_AUTH_SECRET) return;

  const secret = randSecret();
  process.env.APP_AUTH_SECRET = secret;

  const repoRoot = process.cwd();
  const envLocalPath = path.join(repoRoot, '.env.local');
  const line = `\n# Added by scripts/bootstrap-app-user.ts\nAPP_AUTH_SECRET=${secret}\n`;

  try {
    fs.appendFileSync(envLocalPath, line, { encoding: 'utf8' });
  } catch (e) {
    // If we can't write, still continue for this run, but user needs to persist it.
    console.warn('[bootstrap-app-user] Failed to append APP_AUTH_SECRET to .env.local:', e);
    console.warn('[bootstrap-app-user] Please add APP_AUTH_SECRET to your environment for future runs.');
  }
}

function resolveEmail() {
  const email = (process.env.APP_USER_EMAIL || 'local-dev@xhs-runner.local').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('APP_USER_EMAIL must be a valid email');
  return email;
}

function resolvePassword() {
  // If not provided, generate a random password and print it.
  return (process.env.APP_USER_PASSWORD || crypto.randomBytes(9).toString('base64url')).trim();
}

function makeActivationCode() {
  return crypto.randomBytes(9).toString('base64url');
}

async function ensureActivationCode(): Promise<string> {
  const code = makeActivationCode();
  await db.insert(schema.appActivationCodes).values({ code }).onConflictDoNothing();
  return code;
}

async function ensureAppAuthTables() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const sqlPath = path.join(process.cwd(), 'drizzle', '0008_app_auth.sql');
  const ddl = fs.readFileSync(sqlPath, 'utf8');

  const client = postgres(databaseUrl, { max: 1 });
  try {
    // Run DDL in one go; statements use IF NOT EXISTS.
    await client.unsafe(ddl);
  } finally {
    await client.end();
  }
}

async function main() {
  ensureAppAuthSecret();

  const email = resolveEmail();
  const password = resolvePassword();

  // Ensure app auth tables exist (some dev DBs may be partially migrated).
  try {
    await db.select({ id: schema.appUsers.id }).from(schema.appUsers).limit(1);
  } catch (e: any) {
    const msg = String(e?.cause?.message || e?.message || e);
    if (msg.includes('relation "app_users" does not exist')) {
      console.log('[bootstrap-app-user] app auth tables missing, applying drizzle/0008_app_auth.sql');
      await ensureAppAuthTables();
    } else {
      throw e;
    }
  }

  const existing = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, email)).limit(1);
  if (existing[0]) {
    console.log('[bootstrap-app-user] user already exists:', email);
    console.log('[bootstrap-app-user] password unchanged (not reset).');
    console.log('[bootstrap-app-user] To reset, delete the row in app_users or implement a reset script.');
    return;
  }

  const activationCode = await ensureActivationCode();

  // Double-check code is unused.
  const codeRows = await db
    .select()
    .from(schema.appActivationCodes)
    .where(and(eq(schema.appActivationCodes.code, activationCode), isNull(schema.appActivationCodes.usedAt)))
    .limit(1);
  if (!codeRows[0]) throw new Error('Failed to create activation code');

  await createUserWithActivationCode({ email, password, activationCode });

  console.log('[bootstrap-app-user] created user');
  console.log('email=' + email);
  console.log('password=' + password);
  console.log('activationCode=' + activationCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

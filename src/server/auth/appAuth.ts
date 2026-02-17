import crypto from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '@/server/db';

const SESSION_COOKIE = 'xhs_runner_session';
const SESSION_TTL_DAYS = 14;

function requireSecret() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) {
    throw new Error('APP_AUTH_SECRET is required for app auth');
  }
  return secret;
}

function pbkdf2Hash(password: string, salt: string): string {
  // PBKDF2 parameters chosen to be reasonable for server-side.
  const derived = crypto.pbkdf2Sync(password, salt, 210_000, 32, 'sha256');
  return derived.toString('hex');
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = pbkdf2Hash(password, salt);
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = pbkdf2Hash(password, salt);
  // constant-time compare
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}

export function newSessionToken(): string {
  // Include secret in the token derivation to make tokens less predictable if RNG is compromised.
  const secret = requireSecret();
  const raw = crypto.randomBytes(32);
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionExpiry(): Date {
  const ms = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export async function createUserWithActivationCode(params: {
  email: string;
  password: string;
  activationCode: string;
}) {
  const email = params.email.trim().toLowerCase();
  const activationCode = params.activationCode.trim();

  // Validate activation code (must exist, not used, not expired)
  const now = new Date();
  const codeRow = await db
    .select()
    .from(schema.appActivationCodes)
    .where(
      and(
        eq(schema.appActivationCodes.code, activationCode),
        isNull(schema.appActivationCodes.usedAt),
        // expiresAt is null OR expiresAt > now
        // drizzle doesn't have OR imported here; use raw logic by fetching and checking.
      )
    );

  const code = codeRow[0];
  if (!code) throw new Error('Invalid activation code');
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) throw new Error('Activation code expired');

  const { salt, hash } = hashPassword(params.password);

  const inserted = await db
    .insert(schema.appUsers)
    .values({
      email,
      passwordHash: hash,
      passwordSalt: salt,
    })
    .returning();

  const user = inserted[0];
  if (!user) throw new Error('Failed to create user');

  await db
    .update(schema.appActivationCodes)
    .set({
      usedAt: now,
      usedByUserId: user.id,
    })
    .where(eq(schema.appActivationCodes.code, activationCode));

  return user;
}

export async function authenticate(email: string, password: string) {
  const e = email.trim().toLowerCase();
  const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, e));
  const user = rows[0];
  if (!user) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return null;
  return user;
}

export async function createSession(userId: number) {
  const token = newSessionToken();
  const expiresAt = getSessionExpiry();
  await db.insert(schema.appSessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string) {
  const now = new Date();
  const rows = await db
    .select({
      userId: schema.appSessions.userId,
      email: schema.appUsers.email,
      sessionExpiresAt: schema.appSessions.expiresAt,
    })
    .from(schema.appSessions)
    .innerJoin(schema.appUsers, eq(schema.appUsers.id, schema.appSessions.userId))
    .where(and(eq(schema.appSessions.token, token), gt(schema.appSessions.expiresAt, now)));

  return rows[0] || null;
}

export async function deleteSession(token: string) {
  await db.delete(schema.appSessions).where(eq(schema.appSessions.token, token));
}

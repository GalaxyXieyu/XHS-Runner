import type { NextApiRequest, NextApiResponse } from 'next';
import { desc } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import { getSessionCookieName, getUserBySessionToken } from '@/server/auth/appAuth';

function isAdmin(email: string | null | undefined) {
  const adminEmail = process.env.APP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return false;
  return (email || '').trim().toLowerCase() === adminEmail;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()];
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const user = await getUserBySessionToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (!isAdmin(user.email)) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const rows = await db
      .select()
      .from(schema.appActivationCodes)
      .orderBy(desc(schema.appActivationCodes.createdAt))
      .limit(50);
    return res.status(200).json({ codes: rows });
  }

  if (req.method === 'POST') {
    const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 20);
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = (await import('crypto')).randomBytes(15).toString('base64url');
      await db.insert(schema.appActivationCodes).values({ code }).onConflictDoNothing();
      codes.push(code);
    }

    return res.status(200).json({ ok: true, codes });
  }

  return res.status(405).json({ error: 'method not allowed' });
}

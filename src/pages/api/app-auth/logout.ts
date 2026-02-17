import type { NextApiRequest, NextApiResponse } from 'next';
import { deleteSession, getSessionCookieName } from '@/server/auth/appAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.cookies?.[getSessionCookieName()];
  if (token) await deleteSession(token);

  res.setHeader(
    'Set-Cookie',
    `${getSessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );

  return res.status(200).json({ ok: true });
}

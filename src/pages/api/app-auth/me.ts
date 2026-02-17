import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionCookieName, getUserBySessionToken } from '@/server/auth/appAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies?.[getSessionCookieName()];
  if (!token) return res.status(200).json({ user: null });

  const user = await getUserBySessionToken(token);
  if (!user) return res.status(200).json({ user: null });

  return res.status(200).json({ user: { id: user.userId, email: user.email } });
}

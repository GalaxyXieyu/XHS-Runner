import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, createSession, getSessionCookieName } from '@/server/auth/appAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await authenticate(email, password);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const session = await createSession(user.id);
    res.setHeader(
      'Set-Cookie',
      `${getSessionCookieName()}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}`
    );

    return res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'login failed' });
  }
}

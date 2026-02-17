import type { NextApiRequest, NextApiResponse } from 'next';
import { createSession, createUserWithActivationCode, getSessionCookieName } from '@/server/auth/appAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, activationCode } = req.body || {};
    if (!email || !password || !activationCode) {
      return res.status(400).json({ error: 'email, password, activationCode are required' });
    }

    const user = await createUserWithActivationCode({ email, password, activationCode });
    const session = await createSession(user.id);

    res.setHeader(
      'Set-Cookie',
      `${getSessionCookieName()}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}`
    );

    return res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'register failed' });
  }
}

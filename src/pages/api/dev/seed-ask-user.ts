import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/server/db';
import { conversations, conversationMessages } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionCookieName, getUserBySessionToken } from '@/server/auth/appAuth';
import crypto from 'crypto';

// Dev-only helper: create a conversation with a pending ask_user message.
// This enables stable UI E2E for ask_user handling without relying on model randomness.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.cookies?.[getSessionCookieName()];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const user = await getUserBySessionToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const body = (req.body || {}) as {
    question?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
    threadId?: string;
  };

  const threadId = body.threadId || `dev_e2e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const question = body.question || 'E2E ask_user: pick one';
  const options = Array.isArray(body.options) && body.options.length > 0
    ? body.options
    : [
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second' },
      ];

  // Reuse existing conversation for the same threadId when provided.
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.threadId, threadId))
    .limit(1);

  const convId = existing[0]?.id
    ? existing[0].id
    : (
        await db
          .insert(conversations)
          .values({
            threadId,
            title: 'dev seed ask_user',
            status: 'active',
            metadata: { seededByUserId: user.userId, kind: 'dev_seed_ask_user' },
          })
          .returning()
      )[0].id;

  await db.insert(conversationMessages).values({
    conversationId: convId,
    role: 'assistant',
    content: '需要你的选择（dev seed）',
    agent: 'dev',
    askUser: {
      question,
      options,
      selectionType: 'single',
      allowCustomInput: false,
      isHITL: false,
      // Used by UI E2E to submit confirm against a deterministic dev thread.
      threadId,
    },
  });

  return res.status(200).json({ ok: true, conversationId: convId, threadId });
}

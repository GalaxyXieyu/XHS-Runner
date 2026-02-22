import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { db } from '@/server/db';
import { scheduledJobs, themes, topics } from '@/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getSessionCookieName, getUserBySessionToken } from '@/server/auth/appAuth';

// Dev-only helper: seed a theme + topics + a daily_generate job for deterministic E2E.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require real login (same as seed-ask-user) so this endpoint isn't publicly abusable.
  const token = req.cookies?.[getSessionCookieName()];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const user = await getUserBySessionToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const body = (req.body || {}) as {
    themeName?: string;
    topicCount?: number;
    outputCount?: number;
  };

  const themeName = body.themeName || 'dev_e2e_daily_generate';
  const topicCount = Math.min(30, Math.max(6, Number(body.topicCount || 10)));
  const outputCount = Math.min(3, Math.max(1, Number(body.outputCount || 1)));

  // 1) Ensure theme exists.
  const existingTheme = await db
    .select()
    .from(themes)
    .where(eq(themes.name, themeName))
    .orderBy(desc(themes.id))
    .limit(1);

  const theme = existingTheme[0]
    ? existingTheme[0]
    : (
        await db
          .insert(themes)
          .values({
            name: themeName,
            description: 'dev seeded theme for daily_generate E2E',
            status: 'active',
            config: { dailyOutputCount: outputCount },
          })
          .returning()
      )[0];

  // 2) Seed a few topics so summaryService can build clusters without LLM.
  const now = Date.now();
  const tags = ['#e2e', '#穿搭', '#居家', '#美食', '#护肤', '#搞钱'];
  const seeded: Array<{ title: string; sourceId: string }> = [];

  for (let i = 0; i < topicCount; i += 1) {
    const nonce = crypto.randomBytes(3).toString('hex');
    const sourceId = `dev_e2e_${now}_${i}_${nonce}`;
    const title = `E2E 热点 ${i + 1}：${tags[i % tags.length]} 方向标题 ${nonce}`;

    // Keep within unique(source, source_id).
    seeded.push({ title, sourceId });
  }

  // Insert in a single batch.
  await db.insert(topics).values(
    seeded.map((item, idx) => ({
      themeId: theme.id,
      keywordId: null,
      title: item.title,
      source: 'dev_e2e',
      sourceId: item.sourceId,
      noteId: item.sourceId,
      url: `https://example.local/note/${item.sourceId}`,
      desc: `seeded topic for daily_generate E2E (#${idx + 1})`,
      tags: JSON.stringify([tags[idx % tags.length].replace(/^#/, ''), 'e2e']),
      likeCount: 100 + idx * 3,
      collectCount: 80 + idx * 2,
      commentCount: 20 + idx,
      createdAt: new Date(Date.now() - idx * 60_000),
    }))
  );

  // 3) Ensure daily_generate job exists for this theme.
  const existingJob = await db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.themeId, theme.id), eq(scheduledJobs.jobType, 'daily_generate')))
    .orderBy(desc(scheduledJobs.id))
    .limit(1);

  const job = existingJob[0]
    ? existingJob[0]
    : (
        await db
          .insert(scheduledJobs)
          .values({
            name: `dev daily_generate (${themeName})`,
            jobType: 'daily_generate',
            themeId: theme.id,
            keywordId: null,
            scheduleType: 'interval',
            intervalMinutes: 1440,
            // Use both keys to survive DTO/legacy normalization.
            params: { outputCount, output_count: outputCount, days: 30, goal: 'collects', seededByUserId: user.userId },
            isEnabled: true,
            priority: 5,
          })
          .returning()
      )[0];

  return res.status(200).json({
    ok: true,
    themeId: theme.id,
    jobId: job.id,
    topicCount,
    outputCount,
  });
}

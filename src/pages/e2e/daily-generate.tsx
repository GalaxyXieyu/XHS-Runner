import { useEffect, useMemo, useState } from 'react';

type SeedResponse = { ok: boolean; themeId: number; jobId: number; topicCount: number; outputCount: number; error?: string };

type JobExecution = {
  id: number;
  status: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: any;
  errorMessage?: string;
};

type CreativeCard = {
  id: string;
  titles: string[];
  content: string;
  tags: string[];
  images: string[];
};

export default function DailyGenerateE2EPage() {
  const [status, setStatus] = useState('init');
  const [error, setError] = useState('');
  const [seed, setSeed] = useState<SeedResponse | null>(null);
  const [execution, setExecution] = useState<JobExecution | null>(null);
  const [latestCreative, setLatestCreative] = useState<CreativeCard | null>(null);
  const [running, setRunning] = useState(false);

  const summary = useMemo(() => {
    const imgCount = latestCreative?.images?.length || 0;
    const contentLen = latestCreative?.content?.length || 0;
    return `status:${status} exec:${execution?.status || '-'} creative:${latestCreative?.id || '-'} images:${imgCount} contentLen:${contentLen}`;
  }, [status, execution?.status, latestCreative?.id, latestCreative?.images?.length, latestCreative?.content?.length]);

  const ensureLoggedIn = async () => {
    const me = await fetch('/api/app-auth/me').then((r) => r.json());
    if (!me?.user) throw new Error('Not logged in. Please login first.');
  };

  const seedAndTrigger = async () => {
    setRunning(true);
    setError('');
    setLatestCreative(null);
    setExecution(null);

    try {
      setStatus('seeding');
      await ensureLoggedIn();

      const seeded = await fetch('/api/dev/seed-daily-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputCount: 1, topicCount: 10 }),
      }).then((r) => r.json());

      if (!seeded?.ok) throw new Error(seeded?.error || 'seed failed');
      setSeed(seeded);

      setStatus('triggering');
      const triggerRes = await fetch(`/api/jobs/${seeded.jobId}/trigger`, { method: 'POST' });
      const triggerData = await triggerRes.json().catch(() => ({}));
      if (!triggerRes.ok) throw new Error(triggerData?.error || 'trigger failed');

      setStatus('polling');

      // Poll latest execution.
      const deadline = Date.now() + 18 * 60 * 1000; // 18 min (real providers can be slow)
      let lastExec: any = null;
      while (Date.now() < deadline) {
        const list = await fetch(`/api/jobs/executions?jobId=${seeded.jobId}&limit=5`).then((r) => r.json());
        const latest = Array.isArray(list) ? list[0] : list?.[0];
        if (latest) {
          lastExec = latest;
          setExecution(latest);
          if (latest.status === 'success' || latest.status === 'failed' || latest.status === 'timeout' || latest.status === 'canceled') {
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!lastExec) throw new Error('no execution found');
      if (lastExec.status !== 'success') {
        throw new Error(lastExec.errorMessage || `job execution not success: ${lastExec.status}`);
      }

      setStatus('loading_creative');

      // Load latest creative for theme with assets.
      const creatives = await fetch(`/api/creatives?themeId=${seeded.themeId}&withAssets=true&limit=1&offset=0`).then((r) => r.json());
      const card = Array.isArray(creatives) ? creatives[0] : null;
      if (!card) throw new Error('no creative created');
      setLatestCreative(card);

      setStatus('done');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    // Auto-run once to make manual smoke easy; tests can still click the button.
    seedAndTrigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'ui-sans-serif, system-ui, -apple-system' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button data-testid="run" onClick={seedAndTrigger} disabled={running}>
          Run daily_generate
        </button>
        <div data-testid="status">{summary}</div>
      </div>

      {error && (
        <pre data-testid="error" style={{ marginTop: 12, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
          {error}
        </pre>
      )}

      {seed && (
        <pre data-testid="seed" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(seed, null, 2)}</pre>
      )}

      {execution && (
        <pre data-testid="execution" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(execution, null, 2)}</pre>
      )}

      {latestCreative && (
        <div data-testid="creative" style={{ marginTop: 12 }}>
          <div>creativeId: {latestCreative.id}</div>
          <div>title: {latestCreative.titles?.[0] || ''}</div>
          <div>tags: {(latestCreative.tags || []).join(' ')}</div>
          <div>images: {(latestCreative.images || []).length}</div>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', maxWidth: 900 }}>
            {latestCreative.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Unified Langfuse CLI for XHS-Runner.
 *
 * Goals:
 * - Replace ad-hoc scripts with one entrypoint: query + analyze.
 * - Keep dependencies at zero (simple argv parsing).
 *
 * Auth:
 *   LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
 *   LANGFUSE_BASE_URL (default http://localhost:23022)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

type Json = any;

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function toMs(since: string): number {
  // Supports: 24h, 7d, 30m
  const m = since.trim().match(/^([0-9]+)\s*([smhd])$/i);
  if (!m) throw new Error(`Invalid --since value: ${since} (expected like 24h/7d/30m)`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var: ${name}`);
}

function buildAuthHeader() {
  const pub = getEnv('LANGFUSE_PUBLIC_KEY');
  const sec = getEnv('LANGFUSE_SECRET_KEY');
  const token = Buffer.from(`${pub}:${sec}`).toString('base64');
  return `Basic ${token}`;
}

function baseUrl() {
  return getEnv('LANGFUSE_BASE_URL', 'http://localhost:23022').replace(/\/$/, '');
}

async function jsonFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      authorization: buildAuthHeader(),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as Json) : null;
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positionals: string[] = [];
  const valueFlags = new Set(['--limit', '--since', '--sessionId', '--export', '--input']);

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags.add(a);
      const next = argv[i + 1];
      if (valueFlags.has(a) && next && !next.startsWith('--')) {
        values[a] = next;
        i += 1;
      }
    } else {
      positionals.push(a);
    }
  }

  return { flags, values, positionals };
}

async function writeJsonMaybe(pathLike: string | undefined, payload: any) {
  if (!pathLike) return;
  const outPath = resolve(pathLike);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function cmdQuery(argv: ReturnType<typeof parseArgs>) {
  const limit = Number(argv.values['--limit'] || '10');
  const since = argv.values['--since'];
  const sessionId = argv.values['--sessionId'];
  const detailed = argv.flags.has('--detailed');

  const params = new URLSearchParams();
  params.set('limit', String(limit));

  if (since) {
    const from = new Date(Date.now() - toMs(since)).toISOString();
    // Langfuse public API uses fromTimestamp/toTimestamp in many versions.
    params.set('fromTimestamp', from);
  }

  if (sessionId) {
    params.set('sessionId', sessionId);
  }

  const listUrl = `${baseUrl()}/api/public/traces?${params.toString()}`;
  const listed = await jsonFetch(listUrl);

  const traces: any[] = Array.isArray(listed?.data) ? listed.data : Array.isArray(listed) ? listed : [];

  let out: any = {
    meta: {
      kind: 'langfuse_query',
      baseUrl: baseUrl(),
      limit,
      since: since || null,
      sessionId: sessionId || null,
      detailed,
      fetchedAt: new Date().toISOString(),
    },
    traces,
  };

  if (detailed) {
    const details: any[] = [];
    for (const t of traces) {
      const id = t?.id;
      if (!id) continue;
      const detailUrl = `${baseUrl()}/api/public/traces/${encodeURIComponent(String(id))}`;
      details.push(await jsonFetch(detailUrl));
    }
    out = { ...out, details };
  }

  const exportPath = argv.values['--export'] || join('.xhs-data', 'langfuse', `${nowStamp()}-traces.json`);
  await writeJsonMaybe(exportPath, out);
  process.stdout.write(`OK wrote ${exportPath}\n`);
}

function pickNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toEpochMs(v: any): number {
  if (!v) return 0;
  const d = new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function topN<T>(arr: T[], n: number, by: (t: T) => number): T[] {
  return [...arr].sort((a, b) => by(b) - by(a)).slice(0, n);
}

async function cmdAnalyze(argv: ReturnType<typeof parseArgs>) {
  const input = argv.values['--input'];
  if (!input) throw new Error('Missing --input (use output of `langfuse query --detailed`)');

  const raw = JSON.parse(await readFile(resolve(input), 'utf8')) as any;
  const details: any[] = Array.isArray(raw?.details) ? raw.details : [];
  if (details.length === 0) {
    throw new Error('Input has no `details`. Re-run query with `--detailed` so we can compute per-agent metrics.');
  }

  type Obs = any;
  const perAgent: Record<string, { count: number; totalMs: number; totalTokens: number; toolCalls: number }> = {};
  const runs: Array<{ traceId: string; totalMs: number }> = [];

  let totalTraces = 0;
  let totalMs = 0;
  let totalTokens = 0;

  for (const d of details) {
    const trace = d?.trace || d;
    const traceId = String(trace?.id || '');
    if (!traceId) continue;

    totalTraces += 1;

    const obs: Obs[] = Array.isArray(d?.observations) ? d.observations : Array.isArray(trace?.observations) ? trace.observations : [];

    // Derive trace duration from start/end if present; else from observations.
    let start = toEpochMs(trace?.timestamp || trace?.startTime);
    let end = toEpochMs(trace?.endTime);

    if (!start || !end) {
      for (const o of obs) {
        const s = toEpochMs(o?.startTime);
        const e = toEpochMs(o?.endTime);
        if (s) start = start ? Math.min(start, s) : s;
        if (e) end = Math.max(end, e);
      }
    }

    const dur = Math.max(0, end - start);
    totalMs += dur;
    runs.push({ traceId, totalMs: dur });

    for (const o of obs) {
      const name = String(o?.name || o?.metadata?.agent || o?.metadata?.agentName || '').trim();
      if (!name) continue;

      const s = toEpochMs(o?.startTime);
      const e = toEpochMs(o?.endTime);
      const ms = Math.max(0, e - s);

      const usage = o?.usage || o?.metadata?.usage || {};
      const tokens = pickNumber(usage.totalTokens ?? usage.total_tokens ?? usage.total ?? usage.tokens);
      totalTokens += tokens;

      const isTool = String(o?.type || '').toUpperCase() === 'SPAN' && /tool|call/i.test(String(o?.metadata?.kind || ''));

      if (!perAgent[name]) perAgent[name] = { count: 0, totalMs: 0, totalTokens: 0, toolCalls: 0 };
      perAgent[name].count += 1;
      perAgent[name].totalMs += ms;
      perAgent[name].totalTokens += tokens;
      if (isTool) perAgent[name].toolCalls += 1;
    }
  }

  const agents = Object.entries(perAgent)
    .map(([agent, v]) => ({ agent, ...v, avgMs: v.count ? v.totalMs / v.count : 0 }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const summary = {
    traces: totalTraces,
    totalMs,
    avgMs: totalTraces ? totalMs / totalTraces : 0,
    totalTokens,
  };

  const slowest = topN(runs, 5, (r) => r.totalMs);

  const out = {
    meta: {
      kind: 'langfuse_analyze',
      input: resolve(input),
      analyzedAt: new Date().toISOString(),
    },
    summary,
    agentMetrics: agents,
    slowestRuns: slowest,
  };

  const exportPath = argv.values['--export'] || join('.xhs-data', 'langfuse', `${nowStamp()}-metrics.json`);
  await writeJsonMaybe(exportPath, out);
  process.stdout.write(`OK wrote ${exportPath}\n`);
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const [cmd] = argv.positionals;

  if (!cmd || argv.flags.has('--help')) {
    const bin = basename(process.argv[1] || 'langfuse.ts');
    process.stdout.write(
      [
        'Langfuse CLI',
        '',
        `Usage: npx tsx scripts/${bin} <query|analyze> [options]`,
        '',
        'query options:',
        '  --limit <n>        default 10',
        '  --since <24h|7d>   optional',
        '  --sessionId <id>   optional',
        '  --detailed         fetch /traces/:id details (required for analyze)',
        '  --export <path>    default .xhs-data/langfuse/<stamp>-traces.json',
        '',
        'analyze options:',
        '  --input <path>     required; output of query --detailed',
        '  --export <path>    default .xhs-data/langfuse/<stamp>-metrics.json',
        '',
        'env:',
        '  LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL',
        '',
      ].join('\n')
    );
    return;
  }

  if (cmd === 'query') return cmdQuery(argv);
  if (cmd === 'analyze') return cmdAnalyze(argv);

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  process.stderr.write(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

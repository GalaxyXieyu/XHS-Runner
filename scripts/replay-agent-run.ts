#!/usr/bin/env node
/**
 * Minimal replay CLI for agent runs.
 *
 * Reads a previous run artifact directory (or index.json) produced by writeRunArtifacts,
 * reconstructs the original request, and replays it against /api/agent/stream.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type PrintMode = 'pretty' | 'json';
type PrintMessageMode = 'preview' | 'full' | 'none';

interface Args {
  run?: string;
  baseUrl: string;
  print: PrintMode;
  dryRun: boolean;
  timeoutMs: number;
  printMessage: PrintMessageMode;
}

interface RunIndex {
  runId?: string;
  themeId?: number | null;
  messagePreview?: string;
  paths?: {
    runDir?: string;
    events?: string;
    agents?: string | null;
  };
}

interface ResolvedInput {
  resolvedIndexPath: string;
  resolvedRunDir: string;
  message: string;
  messageSource: 'supervisor' | 'agentFile' | 'preview';
  themeId?: number;
}

function parseIntStrict(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${flag}: ${value}`);
  return Math.trunc(n);
}

function printUsage(exitCode = 0) {
  const msg = `Usage:
  npx tsx scripts/replay-agent-run.ts --run <runId|runDir|index.json> [options]

Options:
  --run <...>            Run id (folder under .xhs-data/agent-runs) OR a runDir OR a path to index.json
  --baseUrl <url>        API base URL (default: http://localhost:3000)
  --print <pretty|json>  Output mode for received events (default: pretty)
  --dryRun               Do not call the API; print resolved request (redacted by default)
  --timeoutMs <number>   Abort after timeout in ms (default: 300000)
  --printMessage <mode>  Message printing: preview|full|none (default: preview)
  -h, --help             Show help

Examples:
  npx tsx scripts/replay-agent-run.ts --run .xhs-data/agent-runs/<runId>/index.json
  npx tsx scripts/replay-agent-run.ts --run <runId> --baseUrl http://127.0.0.1:3000
  npx tsx scripts/replay-agent-run.ts --run <runId> --dryRun --printMessage full
`;
  // eslint-disable-next-line no-console
  console.log(msg);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: 'http://localhost:3000',
    print: 'pretty',
    dryRun: false,
    timeoutMs: 300_000,
    printMessage: 'preview',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') printUsage(0);

    if (a === '--dryRun') {
      args.dryRun = true;
      continue;
    }

    const take = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('-')) throw new Error(`Missing value for ${a}`);
      i += 1;
      return v;
    };

    if (a === '--run') {
      args.run = take();
      continue;
    }
    if (a === '--baseUrl') {
      args.baseUrl = take();
      continue;
    }
    if (a === '--print') {
      const v = take();
      if (v !== 'pretty' && v !== 'json') throw new Error(`Invalid --print: ${v}`);
      args.print = v;
      continue;
    }
    if (a === '--timeoutMs') {
      args.timeoutMs = parseIntStrict(take(), '--timeoutMs');
      continue;
    }
    if (a === '--printMessage') {
      const v = take();
      if (v !== 'preview' && v !== 'full' && v !== 'none') throw new Error(`Invalid --printMessage: ${v}`);
      args.printMessage = v;
      continue;
    }

    if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);

    // positional fallback for --run
    if (!args.run) {
      args.run = a;
      continue;
    }

    throw new Error(`Unexpected arg: ${a}`);
  }

  return args;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveRunIndexPath(runArg: string): Promise<string> {
  const candidate = path.resolve(process.cwd(), runArg);

  // If the input exists on disk, use it.
  if (await pathExists(candidate)) {
    const st = await fs.stat(candidate);
    if (st.isDirectory()) {
      const indexPath = path.join(candidate, 'index.json');
      if (!(await pathExists(indexPath))) throw new Error(`index.json not found in runDir: ${candidate}`);
      return indexPath;
    }
    if (st.isFile()) {
      if (!candidate.endsWith('index.json')) {
        throw new Error(`Expected index.json path, got file: ${candidate}`);
      }
      return candidate;
    }
  }

  // Otherwise treat it as runId under default artifacts dir.
  const defaultIndex = path.join(process.cwd(), '.xhs-data', 'agent-runs', runArg, 'index.json');
  if (await pathExists(defaultIndex)) return defaultIndex;

  throw new Error(`Unable to resolve run index from: ${runArg}`);
}

async function readJsonFile<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as T;
}

async function resolveInput(indexPath: string): Promise<ResolvedInput> {
  const idx = await readJsonFile<RunIndex>(indexPath);
  const runDir = path.dirname(indexPath);

  // Prefer supervisor input (most faithful).
  // If the index recorded a relative path, resolve it relative to the runDir (not CWD).
  const agentsDirFromIndex = idx.paths?.agents ? String(idx.paths?.agents) : null;
  const agentsDir = agentsDirFromIndex
    ? path.resolve(runDir, agentsDirFromIndex)
    : path.join(runDir, 'agents');

  let message: string | undefined;
  let messageSource: ResolvedInput['messageSource'] = 'preview';
  let themeId: number | undefined;

  // Always take themeId from index if present.
  if (typeof idx.themeId === 'number') themeId = idx.themeId;

  if (await pathExists(agentsDir)) {
    const supervisorPath = path.join(agentsDir, 'supervisor.json');
    if (await pathExists(supervisorPath)) {
      try {
        const supervisor = await readJsonFile<any>(supervisorPath);
        if (typeof supervisor?.input?.message === 'string' && supervisor.input.message.trim()) {
          message = supervisor.input.message;
          messageSource = 'supervisor';
          if (typeof supervisor?.input?.themeId === 'number') themeId = supervisor.input.themeId;
        }
      } catch {
        // best-effort
      }
    }

    if (!message) {
      // Fallback: scan any agent file with input.message.
      const entries = await fs.readdir(agentsDir);
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        const p = path.join(agentsDir, name);
        try {
          const payload = await readJsonFile<any>(p);
          if (typeof payload?.input?.message === 'string' && payload.input.message.trim()) {
            message = payload.input.message;
            messageSource = 'agentFile';
            if (typeof payload?.input?.themeId === 'number') themeId = payload.input.themeId;
            break;
          }
        } catch {
          // best-effort
        }
      }
    }
  }

  if (!message) {
    message = (idx.messagePreview || '').trim();
    messageSource = 'preview';
  }
  if (!message) throw new Error(`No message found in artifacts (index: ${indexPath})`);

  return {
    resolvedIndexPath: indexPath,
    resolvedRunDir: runDir,
    message,
    messageSource,
    themeId,
  };
}

function redactMessage(message: string, mode: PrintMessageMode): string {
  if (mode === 'none') return '[REDACTED]';
  if (mode === 'full') return message;
  const trimmed = message.replace(/\s+/g, ' ').trim();
  const previewLen = 80;
  const preview = trimmed.slice(0, previewLen);
  return preview + (trimmed.length > previewLen ? `… (len=${trimmed.length})` : ` (len=${trimmed.length})`);
}

function truncateText(value: string, max = 8192): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + `\n… [truncated ${value.length - max} chars]`;
}

interface SSEEvent {
  event?: string;
  id?: string;
  retry?: number;
  data: string;
}

function parseSSEBlock(block: string): SSEEvent | null {
  // Spec: each event is a block of lines separated by an empty line.
  const lines = block.split('\n');
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;

  for (const rawLine of lines) {
    const line = rawLine; // already normalized
    if (!line) continue;
    if (line.startsWith(':')) continue; // comment

    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'retry') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) retry = Math.trunc(n);
    }
    // ignore unknown fields safely
  }

  if (dataLines.length === 0 && !event && !id && typeof retry !== 'number') return null;

  return {
    event,
    id,
    retry,
    data: dataLines.join('\n'),
  };
}

async function* parseSSEStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });

    // Normalize newlines incrementally; safe for split CRLF across chunks.
    buf = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (true) {
      const sep = buf.indexOf('\n\n');
      if (sep === -1) break;
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const ev = parseSSEBlock(block);
      if (ev) yield ev;
    }
  }

  // Flush any remaining buffered block if it looks complete.
  const tail = buf.trim();
  if (tail) {
    const ev = parseSSEBlock(tail);
    if (ev) yield ev;
  }
}

function prettyPrintEvent(obj: any) {
  const type = typeof obj?.type === 'string' ? obj.type : 'unknown';
  const agent = typeof obj?.agent === 'string' ? obj.agent : '';
  const content = typeof obj?.content === 'string' ? obj.content : '';
  const msg = `[${type}]${agent ? ` ${agent}` : ''}${content ? `: ${content.slice(0, 120)}` : ''}`;
  // eslint-disable-next-line no-console
  console.log(msg);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.run) printUsage(1);

  const indexPath = await resolveRunIndexPath(args.run);
  const resolved = await resolveInput(indexPath);

  const requestBody: any = {
    message: resolved.message,
  };
  if (typeof resolved.themeId === 'number') requestBody.themeId = resolved.themeId;

  // Always print resolution/evidence first.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        resolvedIndexPath: resolved.resolvedIndexPath,
        resolvedRunDir: resolved.resolvedRunDir,
        messageSource: resolved.messageSource,
        baseUrl: args.baseUrl,
        request: {
          ...requestBody,
          message: redactMessage(resolved.message, args.printMessage),
        },
      },
      null,
      2
    )
  );

  if (args.dryRun) return;

  const controller = new AbortController();
  let abortKind: 'timeout' | 'sigint' | 'done' | 'workflow_complete' | null = null;

  const timeout = setTimeout(() => {
    abortKind = 'timeout';
    controller.abort(new Error('timeout'));
  }, args.timeoutMs);

  const onSigInt = () => {
    abortKind = 'sigint';
    controller.abort(new Error('sigint'));
  };
  process.once('SIGINT', onSigInt);

  try {
    const url = new URL('/api/agent/stream', args.baseUrl).toString();
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = truncateText(await resp.text().catch(() => ''), 8192);
      // eslint-disable-next-line no-console
      console.error(`HTTP ${resp.status} ${resp.statusText}`);
      if (text) {
        // eslint-disable-next-line no-console
        console.error(text);
      }
      process.exit(1);
    }

    if (!resp.body) throw new Error('No response body');

    let completed = false;

    for await (const ev of parseSSEStream(resp.body, controller.signal)) {
      const data = ev.data;
      if (!data) continue;
      if (data.trim() === '[DONE]') {
        completed = true;
        abortKind = 'done';
        controller.abort(new Error('done'));
        break;
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = { raw: truncateText(data, 2048) };
      }

      if (args.print === 'json') {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(parsed));
      } else {
        prettyPrintEvent(parsed);
      }

      if (parsed?.type === 'workflow_complete') {
        completed = true;
        // Give the server a short moment to flush any final events, then abort.
        await delay(250);
        abortKind = 'workflow_complete';
        controller.abort(new Error('workflow_complete'));
        break;
      }
    }

    // If the stream ended naturally: success only if we saw DONE/complete.
    if (!completed) {
      // eslint-disable-next-line no-console
      console.error('Stream ended without [DONE] or workflow_complete');
      process.exit(2);
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      // Do NOT rely on err.message here. Node's fetch often throws a generic AbortError.
      const reason = (controller.signal as any).reason;
      const reasonMsg = typeof reason === 'string'
        ? reason
        : reason instanceof Error
          ? reason.message
          : '';
      const abortMsg = `${abortKind || ''} ${reasonMsg}`.trim();

      if (abortKind === 'timeout' || abortMsg.includes('timeout')) {
        // eslint-disable-next-line no-console
        console.error(`Aborted: timeout after ${args.timeoutMs}ms`);
        process.exit(3);
      }
      if (abortKind === 'sigint' || abortMsg.includes('sigint')) {
        // eslint-disable-next-line no-console
        console.error('Aborted: SIGINT');
        process.exit(130);
      }

      // DONE/workflow_complete path.
      return;
    }

    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', onSigInt);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

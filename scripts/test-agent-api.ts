/**
 * Agent API 测试脚本
 * 用于快速测试 fastMode 和普通模式，支持自动续跑与指标统计。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

const API_BASE = process.env.AGENT_API_BASE || 'http://localhost:3000';
const DEFAULT_MESSAGE = 'Vibecoding 上手教程：面向新手，3步+3坑，80~120字，口语化，小红书风格，包含 #标签。';
const DEFAULT_OUT_DIR = '.xhs-data/test-outputs';

type Mode = 'fast' | 'normal';

interface AskUserOption {
  id: string;
  label?: string;
  description?: string;
}

interface StreamEvent {
  type: string;
  agent?: string;
  content?: string;
  timestamp?: number;
  threadId?: string;
  question?: string;
  options?: AskUserOption[];
  selectionType?: string;
  allowCustomInput?: boolean;
  context?: Record<string, unknown>;
  qualityScores?: any;
  imageAssetIds?: number[];
  title?: string;
  body?: string;
  tags?: string[];
}

type ReferenceInput = { url: string; type?: 'style' | 'layout' | 'content' };

interface TestOptions {
  message: string;
  themeId?: number;
  fastMode?: boolean;
  enableHITL?: boolean;
  imageGenProvider?: string;
  layoutPreference?: string;

  // App session token for auth-gated endpoints (middleware redirects otherwise).
  // Provide via --session <token> or env XHS_RUNNER_SESSION.
  sessionToken?: string;

  // Optional reference images for testing the ref-image workflow.
  // Use --ref "<url>|content" or --ref "<url>|style" (type is optional).
  referenceInputs?: ReferenceInput[];

  autoConfirm?: boolean;
  showAll?: boolean;
  compact?: boolean;
  renderImages?: boolean;
  outDir?: string;
}

interface RunSummary {
  mode: Mode;
  complete: boolean;
  hasImages: boolean;
  totalMs: number;
  agentDurations: Array<{ agent: string; ms: number }>;
  quality?: string;
  title?: string;
  bodyPreview?: string;
  tagCount?: number;
  imageAssetIds: number[];
  imageSaveDir?: string;
  imagePaths: string[];
}

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

function getFirstOptionId(event?: StreamEvent): string | null {
  if (!event?.options || event.options.length === 0) return null;
  return event.options[0]?.id || null;
}

function buildUserResponse(event?: StreamEvent) {
  const optionId = getFirstOptionId(event);
  if (optionId) {
    return { selectedIds: [optionId] };
  }
  if (event?.allowCustomInput) {
    return { customInput: '继续' };
  }
  return { selectedIds: ['approve'] };
}

function buildConfirmPayload(threadId: string, askUserEvent?: StreamEvent) {
  const context = askUserEvent?.context || {};
  const isClarification = Boolean((context as any).__agent_clarification);
  const isHitl = Boolean((context as any).__hitl);

  if (isClarification) {
    return { threadId, userResponse: buildUserResponse(askUserEvent) };
  }

  if (isHitl) {
    return { threadId, action: 'approve' };
  }

  if (askUserEvent) {
    return { threadId, userResponse: buildUserResponse(askUserEvent) };
  }

  return { threadId, action: 'approve' };
}

function extractThreadId(events: StreamEvent[]): string | null {
  const hit = events.find((e) => typeof e.threadId === 'string' && e.threadId.length > 0);
  return hit?.threadId || null;
}

function extractLastAskUser(events: StreamEvent[]): StreamEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'ask_user') return events[i];
  }
  return null;
}

function extractWorkflowComplete(events: StreamEvent[]): StreamEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'workflow_complete') return events[i];
  }
  return null;
}

function extractQualityScore(events: StreamEvent[]): StreamEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'quality_score') return events[i];
  }
  return null;
}

function summarizeQuality(event?: StreamEvent | null): string | undefined {
  if (!event?.qualityScores) return undefined;
  const scores = event.qualityScores?.scores || {};
  const overall = typeof event.qualityScores?.overall === 'number'
    ? event.qualityScores.overall.toFixed(2)
    : 'n/a';
  const dims = [
    ['info', scores.infoDensity],
    ['align', scores.textImageAlignment],
    ['style', scores.styleConsistency],
    ['read', scores.readability],
    ['fit', scores.platformFit],
  ]
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => `${key}:${(value as number).toFixed(2)}`)
    .join(' ');
  return `overall:${overall}${dims ? ` | ${dims}` : ''}`;
}

function buildSummary(mode: Mode, events: StreamEvent[], startedAt: number): RunSummary {
  const agentStarts = new Map<string, number>();
  const agentDurations = new Map<string, number>();
  const firstEventTs = events.find((event) => typeof event.timestamp === 'number')?.timestamp;
  const baseStart = typeof firstEventTs === 'number' ? firstEventTs : startedAt;
  let endTs = baseStart;

  for (const event of events) {
    const ts = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
    endTs = Math.max(endTs, ts);

    if (event.type === 'agent_start' && event.agent) {
      agentStarts.set(event.agent, ts);
    }
    if (event.type === 'agent_end' && event.agent) {
      const start = agentStarts.get(event.agent);
      if (typeof start === 'number') {
        const duration = ts - start;
        agentDurations.set(event.agent, (agentDurations.get(event.agent) || 0) + duration);
      }
    }
  }

  const workflowComplete = extractWorkflowComplete(events);
  const imageAssetIds = Array.isArray(workflowComplete?.imageAssetIds)
    ? workflowComplete!.imageAssetIds!
    : [];

  const title = workflowComplete?.title || '';
  const body = workflowComplete?.body || '';
  const tags = Array.isArray(workflowComplete?.tags) ? workflowComplete!.tags! : [];

  const complete = Boolean(workflowComplete && title.trim() && body.trim());
  const hasImages = imageAssetIds.length > 0;

  const durations = Array.from(agentDurations.entries())
    .map(([agent, ms]) => ({ agent, ms }))
    .sort((a, b) => b.ms - a.ms);

  const quality = summarizeQuality(extractQualityScore(events));

  return {
    mode,
    complete,
    hasImages,
    totalMs: Math.max(0, endTs - baseStart),
    agentDurations: durations,
    quality,
    title: title || undefined,
    bodyPreview: body ? body.slice(0, 120) : undefined,
    tagCount: tags.length,
    imageAssetIds,
    imagePaths: [],
  };
}

async function renderImagesToDisk(
  assetIds: number[],
  outDir: string,
  mode: Mode
): Promise<{ runDir: string; files: string[] }> {
  if (assetIds.length === 0) return { runDir: '', files: [] };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(outDir, `${stamp}-${mode}`);
  await mkdir(runDir, { recursive: true });

  const saved: string[] = [];
  for (let i = 0; i < assetIds.length; i += 1) {
    const assetId = assetIds[i];
    const response = await fetch(`${API_BASE}/api/assets/${assetId}`);
    if (!response.ok) {
      console.warn(`⚠️  获取图片失败: ${assetId} (${response.status})`);
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'jpg'
        : 'bin';
    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = join(runDir, `image-${i + 1}.${ext}`);
    await writeFile(filePath, buffer);
    saved.push(filePath);
  }
  return { runDir, files: saved };
}

async function parseSSEStream(response: Response): Promise<StreamEvent[]> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const events: StreamEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return events;
        try {
          events.push(JSON.parse(data) as StreamEvent);
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
  return events;
}

function printEvent(event: StreamEvent, { showAll = false, compact = false } = {}) {
  if (compact) return;

  if (event.type === 'agent_start') {
    console.log(`🚀 [${event.agent}] 开始`);
  } else if (event.type === 'agent_end') {
    console.log(`✅ [${event.agent}] 完成`);
  } else if (event.type === 'supervisor_decision') {
    console.log(`🔀 Supervisor: ${event.content}`);
  } else if (event.type === 'ask_user') {
    console.log(`❓ 询问用户: ${(event.question || '').slice(0, 50)}...`);
  } else if (event.type === 'workflow_paused') {
    console.log(`⏸️  工作流暂停 (threadId: ${event.threadId})`);
  } else if (event.type === 'image_progress') {
    const progress = ((event as any).progress * 100).toFixed(0);
    console.log(`🖼️  图片进度: ${(event as any).status} ${progress}%`);
  } else if (event.type === 'workflow_complete') {
    console.log('🎉 工作流完成');
  } else if (showAll) {
    console.log(`[${event.type}] ${event.content?.slice(0, 50) || ''}`);
  }
}

async function submitTask(options: TestOptions): Promise<{ threadId: string | null; events: StreamEvent[] }> {
  const {
    message,
    themeId = 1,
    fastMode = false,
    enableHITL = true,
    imageGenProvider = 'jimeng',
    layoutPreference,
    sessionToken,
    referenceInputs,
    showAll = false,
    compact = false,
  } = options;

  console.log(`\n📝 提交任务: ${message}`);
  console.log(`   themeId: ${themeId}, provider: ${imageGenProvider}, fastMode: ${fastMode}, HITL: ${enableHITL}`);
  if (layoutPreference) {
    console.log(`   layoutPreference: ${layoutPreference}`);
  }
  if (referenceInputs && referenceInputs.length > 0) {
    const refs = referenceInputs
      .map((r) => `${r.type || 'auto'}:${r.url}`)
      .join(' | ');
    console.log(`   referenceInputs: ${refs}`);
  }
  console.log('');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['Cookie'] = `xhs_runner_session=${sessionToken}`;

  const response = await fetch(`${API_BASE}/api/agent/stream`, {
    method: 'POST',
    headers,
    redirect: 'manual',
    body: JSON.stringify({
      message,
      themeId,
      fastMode,
      enableHITL,
      imageGenProvider,
      layoutPreference,
      referenceInputs,
    }),
  });

  // If middleware redirects to /login, fetch won't give SSE. Make it explicit.
  if (response.status >= 300 && response.status < 400) {
    const loc = response.headers.get('location') || '';
    throw new Error(
      `Auth required (redirect ${response.status} to ${loc}). `
      + `Set --session <token> or env XHS_RUNNER_SESSION from a logged-in browser session.`
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await parseSSEStream(response);
  const threadId = extractThreadId(events);

  for (const event of events) {
    printEvent(event, { showAll, compact });
  }

  return { threadId, events };
}

async function continueTask(
  threadId: string,
  askUserEvent: StreamEvent | null,
  opts: { showAll?: boolean; compact?: boolean; sessionToken?: string } = {}
): Promise<{ threadId: string | null; events: StreamEvent[] }> {
  const { showAll = false, compact = false, sessionToken } = opts;
  const payload = buildConfirmPayload(threadId, askUserEvent || undefined);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = sessionToken || process.env.XHS_RUNNER_SESSION;
  if (token) headers['Cookie'] = `xhs_runner_session=${token}`;

  const response = await fetch(`${API_BASE}/api/agent/confirm`, {
    method: 'POST',
    headers,
    redirect: 'manual',
    body: JSON.stringify(payload),
  });

  if (response.status >= 300 && response.status < 400) {
    const loc = response.headers.get('location') || '';
    throw new Error(
      `Auth required (redirect ${response.status} to ${loc}). `
      + `Set env XHS_RUNNER_SESSION from a logged-in browser session.`
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await parseSSEStream(response);
  for (const event of events) {
    printEvent(event, { showAll, compact });
  }

  const paused = events.some((e) => e.type === 'workflow_paused');
  return { threadId: paused ? threadId : null, events };
}

async function continueWithDefault(
  threadId: string,
  opts: { showAll?: boolean; compact?: boolean; sessionToken?: string } = {}
) {
  const { showAll = false, compact = false, sessionToken } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = sessionToken || process.env.XHS_RUNNER_SESSION;
  if (token) headers['Cookie'] = `xhs_runner_session=${token}`;

  const response = await fetch(`${API_BASE}/api/agent/confirm`, {
    method: 'POST',
    headers,
    redirect: 'manual',
    body: JSON.stringify({
      threadId,
      userResponse: { selectedIds: ['continue_default'] },
    }),
  });

  if (response.status >= 300 && response.status < 400) {
    const loc = response.headers.get('location') || '';
    throw new Error(
      `Auth required (redirect ${response.status} to ${loc}). `
      + `Set env XHS_RUNNER_SESSION from a logged-in browser session.`
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await parseSSEStream(response);
  for (const event of events) {
    printEvent(event, { showAll, compact });
  }
}

async function runOnce(mode: Mode, options: TestOptions): Promise<RunSummary> {
  const startedAt = Date.now();
  const { autoConfirm = false, renderImages: shouldRenderImages = false, outDir = DEFAULT_OUT_DIR } = options;

  const { threadId, events } = await submitTask({
    ...options,
    fastMode: mode === 'fast',
  });

  let activeThread = threadId;
  let allEvents = [...events];
  let lastAskUser = extractLastAskUser(events);

  while (activeThread && autoConfirm) {
    console.log(`\n⏭️  自动继续 (threadId: ${activeThread})...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await continueTask(activeThread, lastAskUser, {
      showAll: options.showAll,
      compact: options.compact,
      sessionToken: options.sessionToken,
    });
    allEvents = allEvents.concat(result.events);
    lastAskUser = extractLastAskUser(result.events);
    activeThread = result.threadId;
  }

  const summary = buildSummary(mode, allEvents, startedAt);
  if (shouldRenderImages && summary.imageAssetIds.length > 0) {
    const rendered = await renderImagesToDisk(summary.imageAssetIds, outDir, mode);
    summary.imageSaveDir = rendered.runDir;
    summary.imagePaths = rendered.files;
  }

  return summary;
}

function printSummary(summary: RunSummary) {
  const slowest = summary.agentDurations.slice(0, 3)
    .map((item) => `${item.agent}:${formatMs(item.ms)}`)
    .join(' | ');

  console.log(`\n=== ${summary.mode.toUpperCase()} 总结 ===`);
  console.log(`完成: ${summary.complete ? '是' : '否'} | 图片: ${summary.hasImages ? '有' : '无'}`);
  console.log(`总耗时: ${formatMs(summary.totalMs)}${slowest ? ` | 最慢: ${slowest}` : ''}`);
  console.log(`质量: ${summary.quality || 'n/a'}`);
  if (summary.title) {
    console.log(`标题: ${summary.title}`);
  }
  if (summary.bodyPreview) {
    console.log(`正文预览: ${summary.bodyPreview}${summary.bodyPreview.length >= 120 ? '...' : ''}`);
  }
  if (typeof summary.tagCount === 'number') {
    console.log(`标签数: ${summary.tagCount}`);
  }
  if (summary.imageAssetIds.length > 0) {
    console.log(`图片资产ID: ${summary.imageAssetIds.join(', ')}`);
  }
  if (summary.imageSaveDir) {
    console.log(`图片保存目录: ${summary.imageSaveDir}`);
    const files = summary.imagePaths.map((p) => basename(p)).join(', ');
    if (files) console.log(`图片文件: ${files}`);
  } else if (summary.imagePaths.length > 0) {
    // Backward compat if imageSaveDir is missing.
    console.log(`图片已保存: ${summary.imagePaths.join(', ')}`);
  }
}

function printSuiteSummary(results: RunSummary[]) {
  console.log('\n=== 汇总对比 ===');
  for (const item of results) {
    console.log(
      `${item.mode.padEnd(6)} | 完成:${item.complete ? 'Y' : 'N'} | `
      + `耗时:${formatMs(item.totalMs).padEnd(6)} | `
      + `图片:${item.imageAssetIds.length}`
      + (item.quality ? ` | ${item.quality}` : '')
    );
  }
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string | string[]> = {};
  const positionals: string[] = [];
  const valueFlags = new Set([
    '--continue',
    '--out',
    '--theme',
    '--provider',
    '--message',
    '--layout',
    '--ref',
    '--session',
    // Cover title / typography helpers.
    '--preset',
    '--h1',
    '--h2',
    '--badge',
    '--footer',
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      flags.add(arg);
      const next = argv[i + 1];
      if (valueFlags.has(arg) && next && !next.startsWith('--')) {
        const existing = values[arg];
        if (typeof existing === 'string') {
          values[arg] = [existing, next];
        } else if (Array.isArray(existing)) {
          existing.push(next);
          values[arg] = existing;
        } else {
          values[arg] = next;
        }
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, values, positionals };
}

function parseRefSpec(spec: string): { url: string; type?: 'style' | 'layout' | 'content' } {
  const raw = String(spec || '').trim();
  if (!raw) return { url: '' };

  // Format: <url>|<type>  (type optional). Using '|' avoids conflict with 'http(s)://'.
  const parts = raw.split('|');
  const url = parts[0]?.trim() || '';
  const t = (parts[1] || '').trim();
  const type = (t === 'style' || t === 'layout' || t === 'content') ? t : undefined;
  return { url, type };
}

function asArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

async function main() {
  const args = process.argv.slice(2);
  const { flags, values, positionals } = parseArgs(args);

  if (flags.has('--continue')) {
    const threadId = values['--continue'] || positionals[0];
    if (!threadId) {
      console.error('Usage: npx tsx scripts/test-agent-api.ts --continue <threadId>');
      process.exit(1);
    }
    await continueWithDefault(threadId, { showAll: flags.has('--verbose'), compact: flags.has('--compact') });
    return;
  }

  const runBoth = flags.has('--both') || flags.has('--suite');
  const mode: Mode = flags.has('--normal') ? 'normal' : 'fast';

  const baseMessage = (typeof values['--message'] === 'string' ? values['--message'] : '')
    || positionals[0]
    || DEFAULT_MESSAGE;

  const presetRaw = typeof values['--preset'] === 'string' ? values['--preset'] : '';
  const preset = (presetRaw === '2' || presetRaw === '3' || presetRaw === '6') ? presetRaw : '';
  if (presetRaw && !preset) {
    console.error(`Invalid --preset "${presetRaw}". Expected: 2 | 3 | 6`);
    process.exit(1);
  }

  const h1 = typeof values['--h1'] === 'string' ? values['--h1'] : '';
  const h2 = typeof values['--h2'] === 'string' ? values['--h2'] : '';
  const badge = typeof values['--badge'] === 'string' ? values['--badge'] : '';
  const footer = typeof values['--footer'] === 'string' ? values['--footer'] : '';

  const coverLines: string[] = [];
  if (preset) coverLines.push(`封面排版预设: ${preset}`);
  if (h1) coverLines.push(`封面H1: ${h1}`);
  if (h2) coverLines.push(`封面H2: ${h2}`);
  if (badge) coverLines.push(`封面BADGE: ${badge}`);
  if (footer) coverLines.push(`封面FOOTER: ${footer}`);

  const message = coverLines.length > 0
    ? `${baseMessage}\n\n封面排版:\n${coverLines.join('\n')}`
    : baseMessage;
  const themeId = (typeof values['--theme'] === 'string' && values['--theme']) ? Number(values['--theme']) : 1;
  const imageGenProvider = (typeof values['--provider'] === 'string' ? values['--provider'] : '') || 'jimeng';
  // Default to auto-confirm in normal runs to avoid pausing on ask_user/HITL.
  // Escape hatch: pass --no-auto to disable auto-confirm.
  const autoConfirm = flags.has('--no-auto')
    ? false
    : (flags.has('--auto') || runBoth || mode === 'normal');
  const enableHITL = !flags.has('--no-hitl');
  const compact = flags.has('--compact');
  const showAll = flags.has('--verbose');
  const renderImages = flags.has('--render');
  const outDir = (typeof values['--out'] === 'string' ? values['--out'] : '') || DEFAULT_OUT_DIR;

  const rawLayoutPreference = (typeof values['--layout'] === 'string' ? values['--layout'] : undefined);
  const layoutPreference = rawLayoutPreference
    && ['dense', 'balanced', 'visual-first'].includes(rawLayoutPreference)
      ? rawLayoutPreference
      : undefined;
  if (rawLayoutPreference && !layoutPreference) {
    console.error(`Invalid --layout "${rawLayoutPreference}". Expected: dense | balanced | visual-first`);
    process.exit(1);
  }

  const referenceInputs = asArray(values['--ref'])
    .map(parseRefSpec)
    .filter((x) => x.url);

  const sessionToken = (typeof values['--session'] === 'string' ? values['--session'] : '')
    || process.env.XHS_RUNNER_SESSION
    || undefined;

  const baseOptions: TestOptions = {
    message,
    themeId,
    enableHITL,
    imageGenProvider,
    layoutPreference,
    sessionToken,
    referenceInputs: referenceInputs.length > 0 ? referenceInputs : undefined,
    autoConfirm,
    showAll,
    compact,
    renderImages,
    outDir,
  };

  const results: RunSummary[] = [];

  if (runBoth) {
    results.push(await runOnce('fast', baseOptions));
    results.push(await runOnce('normal', baseOptions));
    results.forEach(printSummary);
    printSuiteSummary(results);
    return;
  }

  const summary = await runOnce(mode, { ...baseOptions, fastMode: mode === 'fast' });
  printSummary(summary);
}

main().catch((error) => {
  console.error('\n❌ 错误:', error);
  process.exit(1);
});

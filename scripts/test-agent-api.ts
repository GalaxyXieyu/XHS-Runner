/**
 * Agent API 测试脚本
 * 用于快速测试 fastMode 和普通模式，支持自动续跑与指标统计。
 *
 * Auth:
 * - Supports cookie injection for protected APIs.
 * - Can login via /api/app-auth/login and persist session cookie.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_MESSAGE = 'Vibecoding 上手教程：面向新手，3步+3坑，80~120字，口语化，小红书风格，包含 #标签。';
const DEFAULT_OUT_DIR = '.xhs-data/agent-runs';
const DEFAULT_COOKIE_FILE = '.xhs-data/auth/session.cookie';

type Mode = 'fast' | 'normal';

type HeadersLike = Record<string, string>;

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

interface AuthOptions {
  cookie?: string;
  cookieFile?: string;
  loginEmail?: string;
  loginPassword?: string;
}

interface TestOptions {
  baseUrl: string;
  message: string;
  themeId?: number;
  fastMode?: boolean;
  enableHITL?: boolean;
  imageGenProvider?: string;
  autoConfirm?: boolean;
  showAll?: boolean;
  compact?: boolean;
  renderImages?: boolean;
  outDir?: string;
  allowEmptyImages?: boolean;
  auth?: AuthOptions;
}

interface RunSummary {
  mode: Mode;
  themeId: number;
  complete: boolean;
  hasImages: boolean;
  totalMs: number;
  agentDurations: Array<{ agent: string; ms: number }>;
  quality?: string;
  title?: string;
  bodyPreview?: string;
  tagCount?: number;
  imageAssetIds: number[];
  imagePaths: string[];
  outJsonPath?: string;
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

function buildSummary(mode: Mode, themeId: number, events: StreamEvent[], startedAt: number): RunSummary {
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
    themeId,
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

function normalizeCookie(raw: string): string {
  return raw.trim().replace(/^Cookie:\s*/i, '');
}

function parseSetCookieToCookieHeader(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Node fetch may join multiple Set-Cookie headers with comma; we only need name=value.
  // If there are multiple cookies, best-effort parse by splitting on comma that starts a new cookie.
  const parts = setCookie
    .split(/,(?=[^;]+?=)/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join('; ');
}

async function loadCookieFromFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    const raw = content.trim();
    return raw ? normalizeCookie(raw) : null;
  } catch {
    return null;
  }
}

async function saveCookieToFile(filePath: string, cookie: string) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, normalizeCookie(cookie) + '\n', 'utf8');
}

function buildHeaders(cookie?: string): HeadersLike {
  const headers: HeadersLike = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = normalizeCookie(cookie);
  return headers;
}

function isRedirectToLogin(response: Response): boolean {
  if (response.status !== 307) return false;
  const location = response.headers.get('location') || '';
  return location.includes('/login');
}

async function ensureAuthenticated(response: Response) {
  if (!isRedirectToLogin(response)) return;
  throw new Error('Not authenticated. Provide --cookie or --loginEmail/--loginPassword');
}

async function loginAndGetCookie(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/app-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Login failed: HTTP ${response.status} ${response.statusText}${text ? ` | ${text}` : ''}`);
  }

  const setCookie = response.headers.get('set-cookie');
  const cookie = parseSetCookieToCookieHeader(setCookie);
  if (!cookie) {
    throw new Error('Login succeeded but no Set-Cookie received');
  }

  return cookie;
}

async function resolveCookie(baseUrl: string, auth?: AuthOptions): Promise<string | undefined> {
  if (!auth) return undefined;

  if (auth.cookie) return normalizeCookie(auth.cookie);

  const cookieFile = auth.cookieFile || DEFAULT_COOKIE_FILE;
  const fileCookie = await loadCookieFromFile(cookieFile);
  if (fileCookie) return fileCookie;

  if (auth.loginEmail && auth.loginPassword) {
    const cookie = await loginAndGetCookie(baseUrl, auth.loginEmail, auth.loginPassword);
    await saveCookieToFile(cookieFile, cookie);
    console.log(`[auth] Logged in, cookie saved to ${cookieFile}`);
    return cookie;
  }

  return undefined;
}

async function renderImagesToDisk(
  baseUrl: string,
  assetIds: number[],
  outDir: string,
  mode: Mode,
  authCookie?: string
): Promise<string[]> {
  if (assetIds.length === 0) return [];

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(outDir, `${stamp}-${mode}`);
  await mkdir(runDir, { recursive: true });

  const saved: string[] = [];
  for (let i = 0; i < assetIds.length; i += 1) {
    const assetId = assetIds[i];
    const response = await fetch(`${baseUrl}/api/assets/${assetId}`, {
      headers: authCookie ? { Cookie: authCookie } : undefined,
      redirect: 'manual',
    });
    if (response.status === 307 || response.status === 302) {
      console.warn(`⚠️  获取图片被重定向(可能未登录): ${assetId} (${response.status})`);
      continue;
    }
    if (!response.ok) {
      console.warn(`⚠️  获取图片失败: ${assetId} (${response.status})`);
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      console.warn(`⚠️  获取图片返回HTML(可能未登录): ${assetId}`);
      continue;
    }

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
  return saved;
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

async function submitTask(options: TestOptions, cookie?: string): Promise<{ threadId: string | null; events: StreamEvent[] }> {
  const {
    baseUrl,
    message,
    themeId = 1,
    fastMode = false,
    enableHITL = true,
    imageGenProvider = 'jimeng',
    showAll = false,
    compact = false,
  } = options;

  console.log(`\n📝 提交任务: ${message}`);
  console.log(`   baseUrl: ${baseUrl}`);
  console.log(`   fastMode: ${fastMode}, HITL: ${enableHITL}` + (cookie ? ', auth: cookie' : ', auth: none') + '\n');

  const response = await fetch(`${baseUrl}/api/agent/stream`, {
    method: 'POST',
    headers: buildHeaders(cookie),
    body: JSON.stringify({
      message,
      themeId,
      fastMode,
      enableHITL,
      imageGenProvider,
    }),
    redirect: 'manual',
  });

  await ensureAuthenticated(response);

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
  options: Pick<TestOptions, 'baseUrl'>,
  cookie: string | undefined,
  threadId: string,
  askUserEvent: StreamEvent | null,
  { showAll = false, compact = false } = {}
): Promise<{ threadId: string | null; events: StreamEvent[] }> {
  const payload = buildConfirmPayload(threadId, askUserEvent || undefined);

  const response = await fetch(`${options.baseUrl}/api/agent/confirm`, {
    method: 'POST',
    headers: buildHeaders(cookie),
    body: JSON.stringify(payload),
    redirect: 'manual',
  });

  await ensureAuthenticated(response);

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
  options: Pick<TestOptions, 'baseUrl'>,
  cookie: string | undefined,
  threadId: string,
  { showAll = false, compact = false } = {}
) {
  const response = await fetch(`${options.baseUrl}/api/agent/confirm`, {
    method: 'POST',
    headers: buildHeaders(cookie),
    body: JSON.stringify({
      threadId,
      userResponse: { selectedIds: ['continue_default'] },
    }),
    redirect: 'manual',
  });

  await ensureAuthenticated(response);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await parseSSEStream(response);
  for (const event of events) {
    printEvent(event, { showAll, compact });
  }
}

async function runOnce(mode: Mode, options: TestOptions, cookie?: string): Promise<RunSummary> {
  const startedAt = Date.now();
  const {
    autoConfirm = false,
    renderImages: shouldRenderImages = false,
    outDir = DEFAULT_OUT_DIR,
    themeId = 1,
  } = options;

  const { threadId, events } = await submitTask({
    ...options,
    fastMode: mode === 'fast',
  }, cookie);

  let activeThread = threadId;
  let allEvents = [...events];
  let lastAskUser = extractLastAskUser(events);

  while (activeThread && autoConfirm) {
    console.log(`\n⏭️  自动继续 (threadId: ${activeThread})...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await continueTask({ baseUrl: options.baseUrl }, cookie, activeThread, lastAskUser, {
      showAll: options.showAll,
      compact: options.compact,
    });
    allEvents = allEvents.concat(result.events);
    lastAskUser = extractLastAskUser(result.events);
    activeThread = result.threadId;
  }

  const summary = buildSummary(mode, themeId, allEvents, startedAt);

  if (summary.complete && summary.imageAssetIds.length === 0 && !options.allowEmptyImages) {
    throw new Error(
      `No images were generated (imageAssetIds=[]). This is a regression for the agent pipeline. ` +
      `Re-run with --allow-empty-images to bypass.`
    );
  }

  // Always persist the raw events so we can diff/debug without re-running.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(outDir, { recursive: true });
  const outJsonPath = join(outDir, `${stamp}-${mode}-theme${themeId}.json`);
  await writeFile(
    outJsonPath,
    JSON.stringify(
      {
        meta: {
          baseUrl: options.baseUrl,
          mode,
          themeId,
          message: options.message,
          fastMode: mode === 'fast',
          enableHITL: options.enableHITL,
          imageGenProvider: options.imageGenProvider,
          threadId,
          startedAt,
          authed: Boolean(cookie),
        },
        summary,
        events: allEvents,
      },
      null,
      2
    ),
    'utf8'
  );
  summary.outJsonPath = outJsonPath;

  if (shouldRenderImages && summary.imageAssetIds.length > 0) {
    summary.imagePaths = await renderImagesToDisk(options.baseUrl, summary.imageAssetIds, outDir, mode, cookie);
  }

  return summary;
}

function printSummary(summary: RunSummary) {
  const slowest = summary.agentDurations.slice(0, 3)
    .map((item) => `${item.agent}:${formatMs(item.ms)}`)
    .join(' | ');

  console.log(`\n=== ${summary.mode.toUpperCase()} 总结 (themeId=${summary.themeId}) ===`);
  console.log(`完成: ${summary.complete ? '是' : '否'} | 图片: ${summary.hasImages ? '有' : '无'}`);
  console.log(`总耗时: ${formatMs(summary.totalMs)}${slowest ? ` | 最慢: ${slowest}` : ''}`);
  console.log(`质量: ${summary.quality || 'n/a'}`);
  if (summary.outJsonPath) {
    console.log(`事件JSON: ${summary.outJsonPath}`);
  }
  if (summary.title) {
    console.log(`标题: ${summary.title}`);
  }
  if (summary.bodyPreview) {
    console.log(`正文预览: ${summary.bodyPreview}${summary.bodyPreview.length >= 120 ? '...' : ''}`);
  }
  if (typeof summary.tagCount === 'number') {
    console.log(`标签数: ${summary.tagCount}`);
  }
  if (summary.imagePaths.length > 0) {
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
  const values: Record<string, string> = {};
  const positionals: string[] = [];
  const valueFlags = new Set([
    '--continue',
    '--out',
    '--theme',
    '--themes',
    '--provider',
    '--message',
    '--baseUrl',
    '--loginEmail',
    '--loginPassword',
    '--cookie',
    '--cookieFile',
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      flags.add(arg);
      const next = argv[i + 1];
      if (valueFlags.has(arg) && next && !next.startsWith('--')) {
        values[arg] = next;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, values, positionals };
}

async function main() {
  const args = process.argv.slice(2);
  const { flags, values, positionals } = parseArgs(args);

  const baseUrl = values['--baseUrl'] || process.env.AGENT_API_BASE || DEFAULT_BASE_URL;

  const auth: AuthOptions = {
    cookie: values['--cookie'],
    cookieFile: values['--cookieFile'] || DEFAULT_COOKIE_FILE,
    loginEmail: values['--loginEmail'],
    loginPassword: values['--loginPassword'],
  };
  const cookie = await resolveCookie(baseUrl, auth);

  if (flags.has('--continue')) {
    const threadId = values['--continue'] || positionals[0];
    if (!threadId) {
      console.error('Usage: npx tsx scripts/test-agent-api.ts --continue <threadId>');
      process.exit(1);
    }
    await continueWithDefault({ baseUrl }, cookie, threadId, {
      showAll: flags.has('--verbose'),
      compact: flags.has('--compact'),
    });
    return;
  }

  const runBoth = flags.has('--both') || flags.has('--suite');
  const mode: Mode = flags.has('--normal') ? 'normal' : 'fast';
  const message = values['--message'] || positionals[0] || DEFAULT_MESSAGE;
  const themeId = values['--theme'] ? Number(values['--theme']) : 1;
  const themeIds = (values['--themes'] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((id) => Number.isFinite(id) && id > 0);

  const imageGenProvider = values['--provider'] || 'jimeng';
  const autoConfirm = flags.has('--auto') || runBoth;
  const enableHITL = !flags.has('--no-hitl');
  const compact = flags.has('--compact');
  const showAll = flags.has('--verbose');
  const renderImages = flags.has('--render');
  const allowEmptyImages = flags.has('--allow-empty-images');
  const outDir = values['--out'] || DEFAULT_OUT_DIR;

  const baseOptions: Omit<TestOptions, 'themeId'> = {
    baseUrl,
    message,
    enableHITL,
    imageGenProvider,
    autoConfirm,
    showAll,
    compact,
    renderImages,
    outDir,
    allowEmptyImages,
    auth,
  };

  const targets = themeIds.length > 0 ? themeIds : [themeId];
  const results: RunSummary[] = [];

  for (const id of targets) {
    const options: TestOptions = { ...baseOptions, themeId: id };

    if (runBoth) {
      results.push(await runOnce('fast', options, cookie));
      results.push(await runOnce('normal', options, cookie));
      continue;
    }

    results.push(await runOnce(mode, { ...options, fastMode: mode === 'fast' }, cookie));
  }

  results.forEach(printSummary);
  if (results.length > 1) {
    printSuiteSummary(results);
  }
}

main().catch((error) => {
  console.error('\n❌ 错误:', error);
  process.exit(1);
});

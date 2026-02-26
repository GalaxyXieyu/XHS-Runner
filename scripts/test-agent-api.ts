/**
 * Agent API 测试脚本
 * 用于快速测试 fastMode 和普通模式，支持自动续跑与指标统计。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const API_BASE = process.env.AGENT_API_BASE || 'http://localhost:3000';
const DEFAULT_MESSAGE = 'Vibecoding 上手教程：面向新手，3步+3坑，80~120字，口语化，小红书风格，包含 #标签。';
const DEFAULT_OUT_DIR = '.xhs-data/test-outputs';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

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

  showAll?: boolean;
  compact?: boolean;
  outDir?: string; // run output root

  // Progress reporter (local only, not sent to API).
  progress?: boolean;
  progressIntervalSec?: number;
  onEvent?: (event: StreamEvent) => void;
}

interface RunSummary {
  mode: Mode;
  complete: boolean;
  hasImages: boolean;
  totalMs: number;
  agentDurations: Array<{ agent: string; ms: number }>;
  quality?: string;
  title?: string;
  body?: string;
  bodyPreview?: string;
  tags?: string[];
  tagCount?: number;
  imageAssetIds: number[];
  imageSaveDir?: string;
  imagePaths: string[];
}

type ImageStatus = 'queued' | 'generating' | 'complete' | 'failed';

interface RunProgressArtifact {
  stage: string;
  agent?: string;
  elapsedMs: number;
  lastEventTimestamp: number | null;
  images: Record<ImageStatus, number>;
  lastError?: string | null;
}

function normalizeImageStatus(raw: unknown): ImageStatus | null {
  const v = String(raw || '').toLowerCase();
  if (v === 'queued' || v === 'pending') return 'queued';
  if (v === 'generating' || v === 'running' || v === 'in_progress') return 'generating';
  if (v === 'complete' || v === 'completed' || v === 'success' || v === 'succeeded' || v === 'done') return 'complete';
  if (v === 'failed' || v === 'error') return 'failed';
  return null;
}

function createProgressTracker(params: {
  mode: Mode;
  progressPath: string;
  startedAt: number;
}) {
  const { mode, progressPath, startedAt } = params;

  let stage = 'starting';
  let agent = '';
  let lastEventTimestamp: number | null = null;
  let lastError: string | null = null;

  const imageStatusByTaskId = new Map<number, ImageStatus>();

  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  let pending = false;

  const buildSnapshot = (): RunProgressArtifact => {
    const counts: Record<ImageStatus, number> = {
      queued: 0,
      generating: 0,
      complete: 0,
      failed: 0,
    };

    for (const status of imageStatusByTaskId.values()) {
      counts[status] += 1;
    }

    return {
      stage,
      agent: agent || undefined,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      lastEventTimestamp,
      images: counts,
      lastError,
    };
  };

  const writeProgress = async () => {
    if (writing) return;
    if (!pending) return;

    writing = true;
    try {
      pending = false;
      await writeFile(progressPath, JSON.stringify({ mode, ...buildSnapshot() }, null, 2), 'utf8');
    } finally {
      writing = false;
      if (pending) scheduleWrite(50);
    }
  };

  const scheduleWrite = (delayMs: number) => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      void writeProgress();
    }, delayMs);
  };

  const markDirty = () => {
    pending = true;
    // Debounce a bit so bursts of SSE events don't spam the filesystem.
    scheduleWrite(150);
  };

  const setStage = (nextStage: string, nextAgent?: string) => {
    stage = nextStage;
    if (typeof nextAgent === 'string') agent = nextAgent;
    markDirty();
  };

  const setError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    lastError = message;
    markDirty();
  };

  const onEvent = (event: StreamEvent) => {
    const ts = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
    lastEventTimestamp = ts;

    if (event.type === 'agent_start' && event.agent) {
      stage = 'agent_start';
      agent = event.agent;
    } else if (event.type === 'agent_end' && event.agent) {
      stage = 'agent_end';
      agent = event.agent;
    } else if (event.type === 'workflow_paused') {
      stage = 'workflow_paused';
    } else if (event.type === 'ask_user') {
      stage = 'ask_user';
    } else if (event.type === 'workflow_complete') {
      stage = 'workflow_complete';
    } else if (event.type === 'image_progress') {
      stage = 'image_progress';
      const status = normalizeImageStatus((event as any).status);
      const taskId = (event as any).taskId;
      if (status && typeof taskId === 'number') {
        imageStatusByTaskId.set(taskId, status);
      }
      if (status === 'failed') {
        const msg = (event as any).errorMessage || (event as any).error || event.content;
        if (msg) lastError = String(msg);
      }
    } else if (typeof event.type === 'string' && event.type) {
      stage = event.type;
    }

    markDirty();
  };

  const tick = () => {
    // Keep elapsedMs fresh even if the SSE stream is silent for a while.
    markDirty();
  };

  const flush = async () => {
    pending = true;
    await writeProgress();
  };

  return {
    progressPath,
    setStage,
    setError,
    onEvent,
    tick,
    snapshot: buildSnapshot,
    flush,
  };
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

function compactObject(value: any): any {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const arr = value
      .map((item) => compactObject(item))
      .filter((item) => item !== undefined);
    return arr;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const cv = compactObject(v);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }
  return value;
}

function hydrateEvidenceFromEvents(evidence: any, events: StreamEvent[]) {
  const promptByTaskId = new Map<number, any>();
  for (const e of events) {
    if ((e as any)?.type !== 'image_prompt_ready') continue;
    const taskId = Number((e as any).taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) continue;
    promptByTaskId.set(taskId, e);
  }

  if (!evidence || !Array.isArray(evidence.images)) return evidence;

  for (let i = 0; i < evidence.images.length; i += 1) {
    const taskId = i + 1;
    const pe = promptByTaskId.get(taskId);
    if (!pe) continue;

    const img = evidence.images[i] || {};

    if (img.sequence == null && typeof (pe as any).sequence === 'number') img.sequence = (pe as any).sequence;
    if (img.role == null && typeof (pe as any).role === 'string') img.role = (pe as any).role;
    if (img.provider == null && typeof (pe as any).provider === 'string') img.provider = (pe as any).provider;
    if (img.imageModel == null && typeof (pe as any).imageModel === 'string') img.imageModel = (pe as any).imageModel;

    if (img.finalPromptHash == null && typeof (pe as any).finalPromptHash === 'string') img.finalPromptHash = (pe as any).finalPromptHash;
    if (img.finalPromptPreview == null && typeof (pe as any).finalPromptPreview === 'string') img.finalPromptPreview = (pe as any).finalPromptPreview;
    if (img.finalPromptPath == null && typeof (pe as any).finalPromptPath === 'string') img.finalPromptPath = (pe as any).finalPromptPath;

    if (img.referenceImageCount == null && typeof (pe as any).referenceImageCount === 'number') img.referenceImageCount = (pe as any).referenceImageCount;

    if (img.url == null && typeof img.assetId === 'number') img.url = `/api/assets/${img.assetId}`;

    evidence.images[i] = img;
  }

  return evidence;
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
    body: body || undefined,
    bodyPreview: body ? body.slice(0, 120) : undefined,
    tags: tags.length > 0 ? tags : undefined,
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
  const runDir = join(outDir, mode);
  await mkdir(runDir, { recursive: true });

  if (assetIds.length === 0) return { runDir, files: [] };

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

async function parseSSEStream(
  response: Response,
  opts: { onEvent?: (event: StreamEvent) => void } = {}
): Promise<StreamEvent[]> {
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
          const event = JSON.parse(data) as StreamEvent;
          events.push(event);
          opts.onEvent?.(event);
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
    const status = (event as any).status;
    const progressRaw = typeof (event as any).progress === 'number' ? (event as any).progress : 0;
    const progress = (progressRaw * 100).toFixed(0);
    const taskId = (event as any).taskId;
    const errorMessage = (event as any).errorMessage;
    const prefix = typeof taskId === 'number' ? `#${taskId} ` : '';

    if (status === 'failed' && errorMessage) {
      console.log(`🖼️  图片进度: ${prefix}${status} ${progress}% - ${errorMessage}`);
    } else {
      console.log(`🖼️  图片进度: ${prefix}${status} ${progress}%`);
    }
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
    enableHITL = false,
    imageGenProvider = 'ark',
    layoutPreference,
    sessionToken,
    referenceInputs,
    showAll = false,
    compact = false,
    onEvent,
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

  const events = await parseSSEStream(response, { onEvent });
  const threadId = extractThreadId(events);

  for (const event of events) {
    printEvent(event, { showAll, compact });
  }

  return { threadId, events };
}

async function continueTask(
  threadId: string,
  askUserEvent: StreamEvent | null,
  opts: {
    showAll?: boolean;
    compact?: boolean;
    sessionToken?: string;
    onEvent?: (event: StreamEvent) => void;
  } = {}
): Promise<{ threadId: string | null; events: StreamEvent[] }> {
  const { showAll = false, compact = false, sessionToken, onEvent } = opts;
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

  const events = await parseSSEStream(response, { onEvent });
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
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  const runDir = join(outDir, mode);

  // Create mode dir early so log/progress artifacts (and external tee) have a place to go.
  await mkdir(runDir, { recursive: true });

  const progressEnabled = options.progress !== false;
  const progressIntervalSec = (typeof options.progressIntervalSec === 'number' && options.progressIntervalSec > 0)
    ? options.progressIntervalSec
    : 10;

  const progress = createProgressTracker({
    mode,
    progressPath: join(runDir, 'run-progress.json'),
    startedAt,
  });

  const promptPathsByTaskId = new Map<number, string>();

  const promptWritePromises: Array<Promise<void>> = [];

  const onEvent = (event: StreamEvent) => {
    // Prompt evidence: write full prompt to a text file, keep JSON artifacts small.
    // Prompt evidence: write full prompt to a text file, keep JSON artifacts small.
    if ((event as any)?.type === 'image_prompt_ready') {
      const taskId = Number((event as any).taskId);
      const rawPrompt = (event as any).finalPrompt;

      // Always redact prompts from persisted artifacts (events.jsonl should never contain full prompts).
      delete (event as any).finalPrompt;

      if (Number.isFinite(taskId) && taskId > 0 && typeof rawPrompt === 'string') {
        const promptText = String(rawPrompt);
        if (promptText.trim()) {
          const promptsDir = join(runDir, 'prompts');
          const relPath = join('prompts', `image-${taskId}.prompt.txt`);
          const absPath = join(runDir, relPath);

          const expectedHash = typeof (event as any).finalPromptHash === 'string'
            ? String((event as any).finalPromptHash)
            : '';
          const actualHash = sha256Hex(promptText);
          if (expectedHash && expectedHash !== actualHash) {
            console.warn(`[evidence] image_prompt_ready hash mismatch taskId=${taskId} expected=${expectedHash} actual=${actualHash}`);
          } else if (!expectedHash) {
            console.warn(`[evidence] image_prompt_ready missing finalPromptHash taskId=${taskId}`);
          }

          // Best-effort: never fail the run due to evidence writing.
          const p = mkdir(promptsDir, { recursive: true })
            .then(() => writeFile(absPath, promptText + '\n', 'utf8'))
            .then(() => {
              promptPathsByTaskId.set(taskId, relPath);
            })
            .catch(() => undefined);
          promptWritePromises.push(p);

          // Keep event artifacts compact while retaining traceability.
          (event as any).finalPromptPath = relPath;
        }
      }
    }



    progress.onEvent(event);
    options.onEvent?.(event);
  };

  progress.setStage('submitting');
  await progress.flush();

  const timer = setInterval(() => {
    progress.tick();

    if (!progressEnabled) return;
    const snap = progress.snapshot();
    const imgs = snap.images;
    const agentLabel = snap.agent ? ` agent=${snap.agent}` : '';

    console.log(
      `⏱️  Progress (${mode}): ${formatMs(snap.elapsedMs)} stage=${snap.stage}${agentLabel} `
      + `images q:${imgs.queued} g:${imgs.generating} c:${imgs.complete} f:${imgs.failed}`
    );
  }, Math.round(progressIntervalSec * 1000));

  try {
    const { threadId, events } = await submitTask({
      ...options,
      fastMode: mode === 'fast',
      onEvent,
    });

    // Keep runs non-interactive by default.
    // If the backend still pauses (e.g. enableHITL=true), auto-continue until completion.
    let activeThread = threadId;
    let allEvents = [...events];
    let lastAskUser = extractLastAskUser(events);
    let guard = 0;

    while (activeThread && guard < 20) {
      guard += 1;
      progress.setStage('auto_continue');
      console.log(`\n⏭️  自动继续 (threadId: ${activeThread})...`);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const result = await continueTask(activeThread, lastAskUser, {
        showAll: options.showAll,
        compact: options.compact,
        sessionToken: options.sessionToken,
        onEvent,
      });
      allEvents = allEvents.concat(result.events);
      lastAskUser = extractLastAskUser(result.events);
      activeThread = result.threadId;
    }

    if (activeThread) {
      console.warn(`⚠️  workflow still paused after ${guard} auto-continues (threadId: ${activeThread})`);
    }

    progress.setStage('finalize_prompts');
    await Promise.allSettled(promptWritePromises);

    progress.setStage('render_images');
    const summary = buildSummary(mode, allEvents, startedAt);
    const rendered = await renderImagesToDisk(summary.imageAssetIds, outDir, mode);
    summary.imageSaveDir = rendered.runDir;
    summary.imagePaths = rendered.files;

    progress.setStage('write_artifacts');
    // Persist artifacts for review without digging into logs.
    await writeFile(join(rendered.runDir, 'run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    await writeFile(
      join(rendered.runDir, 'events.jsonl'),
      allEvents.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf8'
    );

    // Evidence artifact: pull the final prompt + provider/model info from the assets table.
    // This keeps an auditable chain even if the SSE events omit the full prompt.
    try {
      const evidencePath = join(rendered.runDir, 'run-evidence.json');
      const { buildRunEvidence } = await import('../src/server/utils/runEvidence');

      let assetsRows: Array<{ id: number; path?: string | null; metadata?: unknown; createdAt?: unknown }> = [];
      let dbError: string | null = null;

      const redact = (msg: string) => msg.replace(/([a-z]+):\/\/([^@\s]+)@/gi, '$1://***@');

      try {
        const { db, schema } = await import('../src/server/db');
        const { inArray } = await import('drizzle-orm');

        if (summary.imageAssetIds.length > 0) {
          assetsRows = await db
            .select({
              id: schema.assets.id,
              path: schema.assets.path,
              metadata: schema.assets.metadata,
              createdAt: schema.assets.createdAt,
            })
            .from(schema.assets)
            .where(inArray(schema.assets.id, summary.imageAssetIds as any));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dbError = redact(msg);
      }

      if (dbError !== null) {
        // DB unavailable: keep asset IDs but mark rows as present so evidence doesn't claim 'missing'.
        assetsRows = summary.imageAssetIds.map((id) => ({ id, path: null, metadata: null }));
      }

      const promptPaths = summary.imageAssetIds.map((_, idx) => promptPathsByTaskId.get(idx + 1) || null);

      let evidence: any = buildRunEvidence({
        mode,
        imageAssetIds: summary.imageAssetIds,
        assets: assetsRows,
        promptPaths,
        includeFullPrompt: false,
      });

      if (dbError !== null) {
        evidence = hydrateEvidenceFromEvents(evidence, allEvents);
      }

      const payload = compactObject({
        ...evidence,
        db: {
          ok: dbError === null,
          ...(dbError ? { error: dbError } : {}),
        },
      });

      await writeFile(evidencePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Best-effort only; evidence is not required to consider the run successful.
    }

    progress.setStage('done');
    await progress.flush();

    return summary;
  } catch (error) {
    progress.setStage('error');
    progress.setError(error);
    await progress.flush().catch(() => undefined);
    throw error;
  } finally {
    clearInterval(timer);
    await progress.flush().catch(() => undefined);
  }
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
    console.log(`run-summary.json: ${join(summary.imageSaveDir, 'run-summary.json')}`);
    console.log(`events.jsonl: ${join(summary.imageSaveDir, 'events.jsonl')}`);
    console.log(`run-evidence.json: ${join(summary.imageSaveDir, 'run-evidence.json')}`);
    console.log(`run-progress.json: ${join(summary.imageSaveDir, 'run-progress.json')}`);
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
    '--progress-interval',
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

  const booleanFlags = new Set([
    '--both',
    '--suite',
    '--fast',
    '--normal',
    '--verbose',
    '--compact',
    '--no-progress',
    '--progress',
    '--help',
  ]);

  const knownFlags = new Set<string>([...valueFlags, ...booleanFlags]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h') {
      flags.add('--help');
      continue;
    }

    if (arg.startsWith('--')) {
      if (!knownFlags.has(arg)) {
        throw new Error('Unknown flag: ' + arg + '. Use --help for usage.');
      }

      flags.add(arg);
      const next = argv[i + 1];

      if (valueFlags.has(arg)) {
        if (!next || next.startsWith('-')) {
          throw new Error('Missing value for ' + arg + '. Use --help for usage.');
        }
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

      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error('Unknown flag: ' + arg + '. Use --help for usage.');
    }

    positionals.push(arg);
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

function printHelp() {
  console.log('\nUsage:\n  npx tsx scripts/test-agent-api.ts [message]\n\nOptions:\n  --help, -h                     Show this help\n  --theme <id>                   Theme ID (default: 1)\n  --provider <ark|jimeng|gemini> Image provider (default: ark)\n  --message <text>               Override prompt message\n  --layout <dense|balanced|visual-first>\n  --ref <url>|<type>             Reference image input; repeatable (type: style|layout|content)\n  --out <dir>                    Output root (default: .xhs-data/test-outputs/...)\n  --compact                      Reduce console output\n  --verbose                      Print more event info\n  --progress / --no-progress     Enable/disable local progress logs\n  --progress-interval <sec>      Progress log interval (default: 10)\n  --both / --suite               Run fast + normal\n  --fast                         Run fast mode (default)\n  --normal                       Run normal mode\n  --continue <threadId>          Continue a paused run\n\nSafety:\n  This script can trigger real image generation calls.\n  Set env XHS_ALLOW_REAL_IMAGE_CALLS=1 to allow providers ark/jimeng/gemini.\n\nExamples:\n  XHS_ALLOW_REAL_IMAGE_CALLS=1 npx tsx scripts/test-agent-api.ts --fast --theme 3 --provider ark --compact\n  npx tsx scripts/test-agent-api.ts --help\n');
}

async function main() {
  const args = process.argv.slice(2);
  const { flags, values, positionals } = parseArgs(args);

  if (flags.has('--help')) {
    printHelp();
    return;
  }

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
  const imageGenProvider = (typeof values['--provider'] === 'string' ? values['--provider'] : '') || 'ark';
  const allowRealCalls = process.env.XHS_ALLOW_REAL_IMAGE_CALLS === '1';
  const realProviders = new Set(['ark', 'jimeng', 'gemini']);
  if (realProviders.has(imageGenProvider) && !allowRealCalls) {
    console.error(
      'Refusing to run with real image provider: ' + imageGenProvider + '. ' +
      'Set env XHS_ALLOW_REAL_IMAGE_CALLS=1 to allow real provider calls.'
    );
    process.exit(1);
  }

  // Test harness defaults: fully automatic, no HITL pauses, always dump images to disk.
  const enableHITL = false;
  const compact = flags.has('--compact');
  const showAll = flags.has('--verbose');

  let progressEnabled = flags.has('--no-progress') ? false : true;
  if (flags.has('--progress')) progressEnabled = true;
  const rawProgressInterval = (typeof values['--progress-interval'] === 'string' ? values['--progress-interval'] : '');
  const progressIntervalSec = rawProgressInterval ? Number(rawProgressInterval) : 10;
  if (rawProgressInterval && (!Number.isFinite(progressIntervalSec) || progressIntervalSec <= 0)) {
    console.error(`Invalid --progress-interval "${rawProgressInterval}". Expected a positive number (seconds).`);
    process.exit(1);
  }

  const outFlag = (typeof values['--out'] === 'string' ? values['--out'] : '') || '';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = outFlag || join(DEFAULT_OUT_DIR, `${stamp}-run`);
  await mkdir(outDir, { recursive: true });

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
    showAll,
    compact,
    outDir,
    progress: progressEnabled,
    progressIntervalSec,
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

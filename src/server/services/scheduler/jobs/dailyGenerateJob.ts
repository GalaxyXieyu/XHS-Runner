// 每日自动生成任务 - 生成 ideas 并自动调用 Agent 生成草稿

import { HumanMessage } from '@langchain/core/messages';

import { ScheduledJob, ExecutionResult, DailyGenerateJobParams } from '../types';
import { ExecutionContext } from '../jobExecutor';
import { getClusterSummaries } from '../../xhs/llm/summaryService';
import { createCreative } from '../../xhs/data/creativeService';
import { getDatabase } from '../../../db';

// 单个 idea 的超时时间（2 分钟）
const PER_IDEA_TIMEOUT_MS = 120000;

function resolveOutputCount(params: DailyGenerateJobParams) {
  return params.outputCount || params.output_count || 5;
}

function normalizeIdea(text: string) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[，,]+/g, ',')
    .replace(/[。．]+/g, '.')
    .replace(/[！!]+/g, '!')
    .replace(/[？?]+/g, '?');
}

// Cheap near-duplicate detector to satisfy "不要完全一模一样" without LLM calls.
function similarity(a: string, b: string) {
  const A = normalizeIdea(a);
  const B = normalizeIdea(b);
  if (!A || !B) return 0;
  if (A === B) return 1;

  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
    return out;
  };

  const gA = grams(A);
  const gB = grams(B);
  let inter = 0;
  for (const g of gA) if (gB.has(g)) inter += 1;
  const union = gA.size + gB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function buildIdeasFromClusters(input: {
  goal: string;
  outputCount: number;
  persona?: string;
  tone?: string;
  clusters: Array<{ tag: string; summary: { topTitles: string[]; tags: string[]; summaries: string[] } }>;
}) {
  const ideas: Array<{ idea: string; meta: Record<string, unknown> }> = [];
  const seenNormalized: string[] = [];

  for (const cluster of input.clusters) {
    if (ideas.length >= input.outputCount) break;

    const topTitle = cluster.summary.topTitles?.[0] || '';
    const tags = (cluster.summary.tags || []).slice(0, 5).join(' ');

    const persona = input.persona ? `面向${input.persona}` : '面向普通用户';
    const tone = input.tone ? `语气：${input.tone}` : '';
    const goal = input.goal ? `目标：提升${input.goal}` : '';

    const idea = [
      `围绕「${cluster.tag}」写一篇小红书图文。`,
      topTitle ? `参考爆款标题方向：${topTitle}。` : '',
      tags ? `建议标签：${tags}。` : '',
      persona,
      goal,
      tone,
      '给出：标题、正文（分段+要点）、5-10个标签。',
    ]
      .filter(Boolean)
      .join(' ');

    const normalized = normalizeIdea(idea);
    const isDup = seenNormalized.some((prev) => similarity(prev, normalized) >= 0.9);
    if (isDup) continue;

    seenNormalized.push(normalized);
    ideas.push({
      idea,
      meta: {
        kind: 'daily_generate_idea',
        clusterTag: cluster.tag,
        topTitle,
        tags: cluster.summary.tags || [],
      },
    });
  }

  return ideas;
}

async function runAgentForIdea(params: { themeId: number; creativeId: number; idea: string }) {
  // Keep scheduler build (tsconfig.server.json) lightweight by not bundling agents into electron/server.
  // Next.js runtime can still load these modules.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMultiAgentSystem } = require('../../../agents/multiAgentSystem') as any;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processAgentStream } = require('../../../agents/utils/streamProcessor') as any;

  const app = await createMultiAgentSystem({ enableHITL: false });

  const initialState: any = {
    messages: [new HumanMessage(params.idea)],
    themeId: params.themeId,
    creativeId: params.creativeId,
  };

  const stream = await app.stream(initialState, { recursionLimit: 100 } as any);

  for await (const _event of processAgentStream(stream, {
    themeId: params.themeId,
    creativeId: params.creativeId,
    enableHITL: false,
  })) {
    // no-op
  }
}

// 带超时的 Agent 执行
async function runAgentWithTimeout(params: { themeId: number; creativeId: number; idea: string }): Promise<void> {
  return Promise.race([
    runAgentForIdea(params),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent 执行超时（${PER_IDEA_TIMEOUT_MS / 1000}秒）`)), PER_IDEA_TIMEOUT_MS)
    ),
  ]);
}

export async function handleDailyGenerateJob(
  job: ScheduledJob,
  params: DailyGenerateJobParams,
  context: ExecutionContext
): Promise<ExecutionResult> {
  if (!job.theme_id) {
    return { success: false, error: 'theme_id required', duration_ms: 0 };
  }

  const outputCount = resolveOutputCount(params);
  const days = params.days || 7;
  const goal = params.goal || 'collects';

  const clusters = await getClusterSummaries(job.theme_id, days, goal);
  if (clusters.length === 0) {
    return { success: true, inserted: 0, total: 0, duration_ms: 0 };
  }

  const ideas = buildIdeasFromClusters({
    goal,
    outputCount,
    persona: (params as any).persona,
    tone: (params as any).tone,
    clusters: clusters as any,
  });

  if (ideas.length === 0) {
    return { success: true, inserted: 0, total: 0, duration_ms: 0 };
  }

  const db = getDatabase();
  let completed = 0;

  for (const item of ideas) {
    if (context.abortController.signal.aborted) {
      throw new Error('任务已取消');
    }

    // Create a draft creative first so agent output has a stable persistence target.
    const creative = await createCreative({
      themeId: job.theme_id,
      title: null,
      content: null,
      tags: null,
      status: 'draft',
      model: 'agent',
      prompt: item.idea,
      rationale: item.meta,
    });

    const nowIso = new Date().toISOString();
    const { data: taskRow, error: insertError } = await db
      .from('generation_tasks')
      .insert({
        theme_id: job.theme_id,
        topic_id: null,
        creative_id: creative.id,
        status: 'queued',
        prompt: item.idea,
        model: 'agent',
        result_json: item.meta,
        created_at: nowIso,
        updated_at: nowIso,
      } as any)
      .select('id')
      .single();

    if (insertError) throw insertError;
    const taskId = Number((taskRow as any).id);

    try {
      await db
        .from('generation_tasks')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', taskId);

      // 使用带超时的 Agent 执行，单个 idea 失败不影响其他 idea
      await runAgentWithTimeout({ themeId: job.theme_id, creativeId: creative.id, idea: item.idea });

      await db
        .from('generation_tasks')
        .update({
          status: 'done',
          updated_at: new Date().toISOString(),
          result_json: { ...item.meta, creativeId: creative.id },
        })
        .eq('id', taskId);

      completed += 1;
    } catch (err: any) {
      console.error(`[dailyGenerateJob] idea ${taskId} 执行失败:`, err?.message || err);
      await db
        .from('generation_tasks')
        .update({
          status: 'failed',
          error_message: err?.message || String(err),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      // 继续处理下一个 idea，不中断整个任务
    }
  }

  return { success: true, inserted: completed, total: ideas.length, duration_ms: 0 };
}

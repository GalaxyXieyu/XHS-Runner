/**
 * AgentLogger - 结构化日志系统
 *
 * 特点:
 * - 紧凑文本格式，token 占用低
 * - 可解析为 JSON，支持 RL 训练
 * - 分级日志控制
 */

import { AgentType } from "../state/agentState";

// 日志级别
export enum LogLevel {
  TRAJECTORY = 0,  // RL 训练数据
  AGENT = 1,       // Agent 事件
  DEBUG = 2,       // 调试详情
}

// 状态快照
export interface StateSnapshot {
  R: 0 | 1;  // researchComplete
  C: 0 | 1;  // contentComplete
  S: 0 | 1;  // styleAnalysisComplete
  Ip: number; // imagePlans count
  Ig: number; // generatedImageCount
  rev: "-" | "approved" | "rejected";
  i: number;  // iterationCount
  max: number; // maxIterations
}

// 步骤记录
export interface Step {
  id: number;
  ts: string;
  node: string;
  state?: StateSnapshot;
  action?: { next: string; reason: string };
  result?: { ok: boolean; summary: string };
  label?: { correct?: boolean; preferred?: string };
}

// 轨迹
export interface Trajectory {
  id: string;
  createdAt: string;
  input: { prompt: string; refImg: boolean; theme?: number };
  steps: Step[];
  output?: { ok: boolean; creative?: number; images?: number; steps?: number; iter?: number };
  labels?: { overall?: { ok: boolean; quality: number; annotator?: string } };
}

// 当前日志级别
let currentLevel = LogLevel.AGENT;

// 活跃轨迹
const trajectories = new Map<string, Trajectory>();

// 日志输出缓冲
const logBuffer = new Map<string, string[]>();

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * 开始轨迹
 */
export function startTraj(
  threadId: string,
  prompt: string,
  refImg: boolean,
  theme?: number
): void {
  const traj: Trajectory = {
    id: threadId,
    createdAt: new Date().toISOString(),
    input: { prompt, refImg, theme },
    steps: [],
  };
  trajectories.set(threadId, traj);
  logBuffer.set(threadId, []);

  const line = `#TRAJ ${threadId} ${traj.createdAt}`;
  const inputLine = `@IN prompt="${prompt}" ref_img=${refImg ? 1 : 0}${theme ? ` theme=${theme}` : ""}`;

  appendLog(threadId, line);
  appendLog(threadId, inputLine);
  appendLog(threadId, "");
}

/**
 * 记录 supervisor 决策
 */
export function logSupervisor(
  threadId: string,
  state: StateSnapshot,
  next: AgentType | "END",
  reason: string
): void {
  const traj = trajectories.get(threadId);
  if (!traj) return;

  const stepId = traj.steps.length;
  const ts = timeStr();

  const step: Step = {
    id: stepId,
    ts,
    node: "SUP",
    state,
    action: { next, reason },
  };
  traj.steps.push(step);

  const stateLine = `R:${state.R} C:${state.C} S:${state.S} I:${state.Ip}/${state.Ig} rev:${state.rev} i:${state.i}/${state.max}`;
  const line = `[${stepId}] ${ts} SUP | ${stateLine}\n    -> ${next} | ${reason}`;

  appendLog(threadId, line);
}

/**
 * 记录 agent 执行结果
 */
export function logAgent(
  threadId: string,
  agent: AgentType,
  ok: boolean,
  summary: string
): void {
  const traj = trajectories.get(threadId);
  if (!traj) return;

  const stepId = traj.steps.length;
  const ts = timeStr();

  const step: Step = {
    id: stepId,
    ts,
    node: agent,
    result: { ok, summary },
  };
  traj.steps.push(step);

  const status = ok ? "OK" : "FAIL";
  const line = `[${stepId}] ${ts} ${agent} | ${status} | ${summary}`;

  appendLog(threadId, line);
}

/**
 * 结束轨迹
 */
export function endTraj(
  threadId: string,
  ok: boolean,
  output?: { creative?: number; images?: number }
): Trajectory | null {
  const traj = trajectories.get(threadId);
  if (!traj) return null;

  const supSteps = traj.steps.filter(s => s.node === "SUP").length;
  traj.output = {
    ok,
    creative: output?.creative,
    images: output?.images,
    steps: traj.steps.length,
    iter: supSteps,
  };

  const line = `\n@OUT ok=${ok ? 1 : 0}${output?.creative ? ` creative=${output.creative}` : ""}${output?.images ? ` images=${output.images}` : ""} steps=${traj.steps.length} iter=${supSteps}`;
  appendLog(threadId, line);

  saveTraj(threadId);

  trajectories.delete(threadId);
  return traj;
}

/**
 * 获取紧凑日志文本
 */
export function getLogText(threadId: string): string {
  return logBuffer.get(threadId)?.join("\n") ?? "";
}

/**
 * 获取轨迹 JSON
 */
export function getTraj(threadId: string): Trajectory | undefined {
  return trajectories.get(threadId);
}

/**
 * 调试日志（仅 DEBUG 级别输出）
 */
export function debug(threadId: string, msg: string): void {
  if (currentLevel >= LogLevel.DEBUG) {
    console.log(`[${threadId.slice(-6)}] ${msg}`);
  }
}

/**
 * 从状态提取快照
 */
export function extractState(state: {
  researchComplete: boolean;
  contentComplete: boolean;
  styleAnalysis: unknown | null;
  imagePlans: unknown[];
  generatedImageCount: number;
  reviewFeedback: { approved: boolean } | null;
  iterationCount: number;
  maxIterations: number;
}): StateSnapshot {
  return {
    R: state.researchComplete ? 1 : 0,
    C: state.contentComplete ? 1 : 0,
    S: state.styleAnalysis ? 1 : 0,
    Ip: state.imagePlans.length,
    Ig: state.generatedImageCount,
    rev: state.reviewFeedback
      ? state.reviewFeedback.approved ? "approved" : "rejected"
      : "-",
    i: state.iterationCount,
    max: state.maxIterations,
  };
}

/**
 * 解析紧凑日志为 Trajectory
 */
export function parseLog(log: string): Trajectory | null {
  const lines = log.split("\n");
  let traj: Trajectory | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#TRAJ")) {
      const parts = trimmed.split(" ");
      traj = {
        id: parts[1],
        createdAt: parts[2],
        input: { prompt: "", refImg: false },
        steps: [],
      };
    }
    else if (trimmed.startsWith("@IN") && traj) {
      const kv = parseKV(trimmed.slice(4));
      traj.input = {
        prompt: kv.prompt ?? "",
        refImg: kv.ref_img === 1,
        theme: kv.theme,
      };
    }
    else if (trimmed.match(/^\[\d+\]/) && traj) {
      const step = parseStepLine(trimmed);
      if (step) traj.steps.push(step);
    }
    else if (trimmed.startsWith("->") && traj && traj.steps.length > 0) {
      const last = traj.steps[traj.steps.length - 1];
      const match = trimmed.match(/^->\s*(\S+)\s*\|\s*(.+)$/);
      if (match) {
        last.action = { next: match[1], reason: match[2] };
      }
    }
    else if (trimmed.startsWith("@OUT") && traj) {
      const kv = parseKV(trimmed.slice(5));
      traj.output = {
        ok: kv.ok === 1,
        creative: kv.creative,
        images: kv.images,
        steps: kv.steps,
        iter: kv.iter,
      };
    }
  }

  return traj;
}

// === 内部函数 ===

function appendLog(threadId: string, line: string): void {
  const buf = logBuffer.get(threadId);
  if (buf) {
    buf.push(line);
    if (currentLevel >= LogLevel.AGENT) {
      console.log(line);
    }
  }
}

function timeStr(): string {
  return new Date().toISOString().slice(11, 19);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + ".." : s;
}

function parseKV(s: string): Record<string, any> {
  const result: Record<string, any> = {};
  const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let m;
  while ((m = regex.exec(s))) {
    const val = m[2] ?? m[3];
    result[m[1]] = isNaN(+val) ? val : +val;
  }
  return result;
}

function parseStepLine(line: string): Step | null {
  const match = line.match(/^\[(\d+)\]\s+(\S+)\s+(\S+)\s*\|\s*(.+)$/);
  if (!match) return null;

  const [, id, ts, node, rest] = match;
  const step: Step = { id: +id, ts, node };

  if (node === "SUP") {
    const stateMatch = rest.match(/R:(\d)\s+C:(\d)\s+S:(\d)\s+I:(\d+)\/(\d+)\s+rev:(\S+)\s+i:(\d+)\/(\d+)/);
    if (stateMatch) {
      step.state = {
        R: +stateMatch[1] as 0 | 1,
        C: +stateMatch[2] as 0 | 1,
        S: +stateMatch[3] as 0 | 1,
        Ip: +stateMatch[4],
        Ig: +stateMatch[5],
        rev: stateMatch[6] as "-" | "approved" | "rejected",
        i: +stateMatch[7],
        max: +stateMatch[8],
      };
    }
  } else {
    const parts = rest.split("|").map(p => p.trim());
    if (parts.length >= 2) {
      step.result = {
        ok: parts[0] === "OK",
        summary: parts[1] ?? "",
      };
    }
  }

  return step;
}

async function saveTraj(threadId: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const dataDir = path.join(process.cwd(), "data", "trajectories");
    await fs.mkdir(dataDir, { recursive: true });

    const logFile = path.join(dataDir, `${threadId}.log`);
    await fs.writeFile(logFile, getLogText(threadId), "utf-8");

    const traj = trajectories.get(threadId);
    if (traj) {
      const jsonlFile = path.join(dataDir, "trajectories.jsonl");
      await fs.appendFile(jsonlFile, JSON.stringify(traj) + "\n", "utf-8");
    }
  } catch (e) {
    console.error("[AgentLogger] Save failed:", e);
  }
}

import { promises as fs } from "node:fs";
import * as path from "node:path";

// Local run artifacts are meant for debugging and for coding agents to quickly index runs.
// We keep them in .xhs-data so they are ignored by default and don't pollute the repo.
export const DEFAULT_RUNS_DIR = path.join(process.cwd(), ".xhs-data", "agent-runs");

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface RunArtifactsInput {
  runId: string;
  conversationId?: number;
  message: string;
  themeId?: number;
  tags?: string[];
  status: "completed" | "paused" | "aborted" | "failed";
  collectedEvents: any[];
  agentInputs?: Map<string, any>;
  agentOutputs?: Map<string, any>;
  errorMessage?: string;
}

export async function writeRunArtifacts(input: RunArtifactsInput, baseDir = DEFAULT_RUNS_DIR): Promise<string> {
  const runDir = path.join(baseDir, safeName(input.runId));
  await fs.mkdir(runDir, { recursive: true });

  const eventsPath = path.join(runDir, "events.jsonl");
  const indexPath = path.join(runDir, "index.json");
  const agentsDir = path.join(runDir, "agents");

  // Write events as JSONL for fast grep and streaming-friendly storage.
  // Keep it best-effort: if events are huge, this still writes progressively.
  const lines = (input.collectedEvents || []).map((e) => JSON.stringify(e));
  await fs.writeFile(eventsPath, `${lines.join("\n")}\n`, "utf-8");

  if (input.agentInputs || input.agentOutputs) {
    await fs.mkdir(agentsDir, { recursive: true });

    const keys = new Set<string>();
    for (const k of input.agentInputs?.keys() || []) keys.add(k);
    for (const k of input.agentOutputs?.keys() || []) keys.add(k);

    for (const key of keys) {
      const payload = {
        agent: key,
        input: input.agentInputs?.get(key) ?? null,
        output: input.agentOutputs?.get(key) ?? null,
      };
      const fileName = `${safeName(key) || "agent"}.json`;
      await fs.writeFile(path.join(agentsDir, fileName), JSON.stringify(payload, null, 2), "utf-8");
    }
  }

  // Build a compact index for quick browsing.
  const startedAt = (input.collectedEvents?.[0]?.timestamp as number | undefined) || Date.now();
  const lastEvent = input.collectedEvents?.[input.collectedEvents.length - 1];
  const endedAt = (lastEvent?.timestamp as number | undefined) || Date.now();

  const index = {
    runId: input.runId,
    conversationId: input.conversationId ?? null,
    themeId: input.themeId ?? null,
    status: input.status,
    tags: input.tags ?? [],
    messagePreview: String(input.message || "").slice(0, 200),
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    errorMessage: input.errorMessage ?? null,
    paths: {
      runDir,
      events: eventsPath,
      agents: input.agentInputs || input.agentOutputs ? agentsDir : null,
    },
  };

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

  return runDir;
}

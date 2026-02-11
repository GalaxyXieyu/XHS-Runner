/**
 * Sync default prompts to Langfuse (single-flow core prompts only).
 * Run: npx tsx scripts/sync-prompts-to-langfuse.ts
 */
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import { uploadPromptToLangfuse, getAgentPrompt } from "../src/server/services/promptManager";

config({ path: ".env.local" });

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const CORE_PROMPTS = new Set([
  "supervisor",
  "brief_compiler_agent",
  "research_agent",
  "reference_intelligence_agent",
  "layout_planner_agent",
  "writer_agent",
  "image_planner_agent",
  "review_agent",
]);

function parseYamlPrompt(content: string): string | null {
  const lines = content.split("\n");
  const promptLineIndex = lines.findIndex((line) => line.trimStart().startsWith("prompt:"));
  if (promptLineIndex < 0) return null;

  let baseIndent: number | null = null;
  const promptLines: string[] = [];

  for (let i = promptLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (baseIndent !== null) promptLines.push("");
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (baseIndent === null) {
      baseIndent = indent;
    } else if (indent < baseIndent) {
      break;
    }

    promptLines.push(line.slice(baseIndent));
  }

  const prompt = promptLines.join("\n").trim();
  return prompt || null;
}

async function syncPromptsToLangfuse() {
  console.log("Start syncing prompts to Langfuse...\n");

  if (!fs.existsSync(PROMPTS_DIR)) {
    console.error("Prompts directory not found:", PROMPTS_DIR);
    return;
  }

  const files = fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .filter((f) => CORE_PROMPTS.has(path.basename(f, path.extname(f))));

  const agentNamesToVerify: string[] = [];

  for (const file of files) {
    const agentName = path.basename(file, path.extname(file));
    agentNamesToVerify.push(agentName);
    const content = fs.readFileSync(path.join(PROMPTS_DIR, file), "utf-8");

    console.log("Processing:", file, "->", agentName);

    const prompt = parseYamlPrompt(content);
    if (!prompt) {
      console.warn("Skip invalid prompt file:", file);
      continue;
    }

    try {
      const success = await uploadPromptToLangfuse(agentName, prompt, true);
      if (success) {
        console.log("  OK uploaded");
      } else {
        console.log("  WARN Langfuse unavailable, fallback only");
      }
    } catch (error) {
      console.error("  FAIL upload:", error);
    }
  }

  console.log("\nVerify uploaded prompts:\n");
  for (const agentName of agentNamesToVerify) {
    const prompt = await getAgentPrompt(agentName);
    console.log(prompt ? "OK" : "MISS", agentName);
  }

  console.log("\nDone.");
}

syncPromptsToLangfuse().catch(console.error);

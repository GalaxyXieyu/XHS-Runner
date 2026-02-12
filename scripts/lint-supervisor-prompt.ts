/**
 * 校验 supervisor prompt 的关键约束是否存在。
 * 用法: npx tsx scripts/lint-supervisor-prompt.ts
 */

import { promises as fs } from "fs";
import * as path from "path";

const PROMPT_PATH = path.join(process.cwd(), "prompts", "supervisor.yaml");

const REQUIRED_SNIPPETS = [
  "askUser",
  "requirementClarity",
  "clarificationRounds",
  "需求澄清",
  // Ensure the output contract remains JSON-based.
  "next_agent",
];

function parsePromptBlock(content: string): string {
  const lines = content.split(/\r?\n/);
  const promptLineIndex = lines.findIndex((line) => line.trimStart().startsWith("prompt:"));
  if (promptLineIndex < 0) return "";

  const promptLines: string[] = [];
  let baseIndent: number | null = null;

  for (let index = promptLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
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

  return promptLines.join("\n");
}

async function main() {
  const fileContent = await fs.readFile(PROMPT_PATH, "utf-8");
  const prompt = parsePromptBlock(fileContent);

  if (!prompt.trim()) {
    console.error("❌ supervisor prompt 为空或解析失败");
    process.exit(1);
  }

  const missing = REQUIRED_SNIPPETS.filter((snippet) => !prompt.includes(snippet));
  if (missing.length > 0) {
    console.error("❌ supervisor prompt 缺少关键片段:");
    missing.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }

  console.log("✅ supervisor prompt lint 通过");
  console.log(`- 文件: ${PROMPT_PATH}`);
  console.log(`- 长度: ${prompt.length} chars`);
}

main().catch((error) => {
  console.error("lint 失败:", error);
  process.exit(1);
});

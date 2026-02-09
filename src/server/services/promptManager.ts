/**
 * Prompt Manager - 以 Langfuse 为主数据源的 prompt 管理服务
 *
 * 工作流程：
 * 1. 从 Langfuse 拉取最新的 prompt
 * 2. 如果 Langfuse 不可用，回退到本地 prompts/*.yaml
 *
 * 在 Langfuse 中管理 prompt：
 * - 创建 prompt 时使用 "xhs-agent-{agent_name}" 格式命名
 * - 例如：xhs-agent-supervisor, xhs-agent-writer, xhs-agent-research
 */

import { promises as fs } from "fs";
import * as path from "path";
import { getLangfuse } from "./langfuseService";

// Prompt 缓存
const promptCache = new Map<string, { prompt: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存
const LOCAL_PROMPTS_DIR = path.resolve(process.cwd(), "prompts");
const PROMPT_FILE_EXTENSIONS = [".yaml", ".yml"] as const;

function parsePromptBlock(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const promptLineIndex = lines.findIndex((line) => line.trimStart().startsWith("prompt:"));
  if (promptLineIndex < 0) return null;

  const promptLine = lines[promptLineIndex];
  const inlineValue = promptLine.replace(/^\s*prompt:\s*/, "").trim();
  const isBlockStyle = ["|", "|-", "|+", ">", ">-", ">+"].includes(inlineValue);

  if (inlineValue && !isBlockStyle) {
    return inlineValue.replace(/^['"]|['"]$/g, "").trim() || null;
  }

  let baseIndent: number | null = null;
  const promptLines: string[] = [];

  for (let index = promptLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      if (baseIndent === null) continue;
      promptLines.push("");
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

async function fetchFromLocalPromptFile(agentName: string): Promise<string | null> {
  for (const ext of PROMPT_FILE_EXTENSIONS) {
    const filePath = path.join(LOCAL_PROMPTS_DIR, `${agentName}${ext}`);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsedPrompt = parsePromptBlock(content);
      if (parsedPrompt) return parsedPrompt;

      console.warn(`[PromptManager] Prompt block not found in local file: ${filePath}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.warn(`[PromptManager] Failed to read local prompt file: ${filePath}`, error);
      }
    }
  }

  return null;
}

/**
 * 从 Langfuse 获取 prompt
 */
async function fetchFromLangfuse(agentName: string): Promise<string | null> {
  try {
    const langfuse = await getLangfuse();
    if (!langfuse) {
      return null;
    }

    const promptName = `xhs-agent-${agentName}`;
    // 获取 production 标签的 prompt
    const prompt = await langfuse.getPrompt(promptName, undefined, {
      label: "production",
    });

    if (prompt) {
      return prompt.prompt;
    }
    return null;
  } catch (error) {
    console.error(`[PromptManager] Failed to fetch from Langfuse: ${agentName}`, error);
    return null;
  }
}

/**
 * 获取 Agent 的 system prompt
 *
 * 优先级：
 * 1. 内存缓存（5分钟内）
 * 2. Langfuse（主数据源）
 * 3. 本地 prompts/*.yaml
 */
export async function getAgentPrompt(
  agentName: string,
  variables?: Record<string, string>
): Promise<string | null> {
  // 1. 检查内存缓存
  const cached = promptCache.get(agentName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return applyVariables(cached.prompt, variables);
  }

  // 2. 从 Langfuse 获取，失败则回退本地 YAML
  const promptFromLangfuse = await fetchFromLangfuse(agentName);
  const prompt = promptFromLangfuse || (await fetchFromLocalPromptFile(agentName));

  // 3. 全部失败
  if (!prompt) {
    return null;
  }

  // 更新缓存
  promptCache.set(agentName, { prompt, timestamp: Date.now() });

  return applyVariables(prompt, variables);
}

/**
 * 应用模板变量
 */
function applyVariables(prompt: string, variables?: Record<string, string>): string {
  if (!variables) return prompt;

  let result = prompt;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

/**
 * 上传 prompt 到 Langfuse（用于代码中修改 prompt 后同步）
 */
export async function uploadPromptToLangfuse(
  agentName: string,
  systemPrompt: string,
  isProduction = false
): Promise<boolean> {
  try {
    const langfuse = await getLangfuse();
    if (!langfuse) {
      console.warn("[PromptManager] Langfuse not available");
      return false;
    }

    const promptName = `xhs-agent-${agentName}`;

    // 创建新版本的 prompt
    await langfuse.createPrompt({
      name: promptName,
      prompt: systemPrompt,
      isActive: isProduction,
      labels: isProduction ? ["production"] : ["development"],
    });

    return true;
  } catch (error) {
    console.error(`[PromptManager] Failed to upload to Langfuse: ${agentName}`, error);
    return false;
  }
}

/**
 * 清除 prompt 缓存
 */
export function clearPromptCache(agentName?: string): void {
  if (agentName) {
    promptCache.delete(agentName);
  } else {
    promptCache.clear();
  }
}

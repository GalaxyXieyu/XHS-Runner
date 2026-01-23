/**
 * Prompt Manager - 以 Langfuse 为主数据源的 prompt 管理服务
 *
 * 工作流程：
 * 1. 每次运行时从 Langfuse 拉取最新的 prompt
 * 2. 同步到本地数据库作为缓存
 * 3. 如果 Langfuse 不可用，使用数据库缓存
 *
 * 在 Langfuse 中管理 prompt：
 * - 创建 prompt 时使用 "xhs-agent-{agent_name}" 格式命名
 * - 例如：xhs-agent-supervisor, xhs-agent-writer, xhs-agent-research
 */

import { getLangfuse } from "./langfuseService";
import { query, queryOne, getPool } from "../pg";

// Prompt 缓存
const promptCache = new Map<string, { prompt: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

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
      // 同步到数据库
      await syncToDatabase(agentName, promptName, prompt.prompt, prompt.version);
      return prompt.prompt;
    }
    return null;
  } catch (error) {
    console.error(`[PromptManager] Failed to fetch from Langfuse: ${agentName}`, error);
    return null;
  }
}

/**
 * 同步 prompt 到数据库
 */
async function syncToDatabase(
  agentName: string,
  langfusePromptName: string,
  systemPrompt: string,
  version: number
): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO agent_prompts (agent_name, langfuse_prompt_name, system_prompt, version, last_synced_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (agent_name)
       DO UPDATE SET
         langfuse_prompt_name = EXCLUDED.langfuse_prompt_name,
         system_prompt = EXCLUDED.system_prompt,
         version = EXCLUDED.version,
         last_synced_at = EXCLUDED.last_synced_at,
         updated_at = EXCLUDED.updated_at`,
      [agentName, langfusePromptName, systemPrompt, version]
    );
  } catch (error) {
    console.error(`[PromptManager] Database sync error: ${agentName}`, error);
  }
}

/**
 * 从数据库获取缓存的 prompt
 */
async function fetchFromDatabase(agentName: string): Promise<string | null> {
  try {
    const data = await queryOne<{ system_prompt: string }>(
      `SELECT system_prompt FROM agent_prompts
       WHERE agent_name = $1 AND is_enabled = true`,
      [agentName]
    );
    return data?.system_prompt || null;
  } catch (error) {
    console.error(`[PromptManager] Failed to fetch from database: ${agentName}`, error);
    return null;
  }
}

/**
 * 获取 Agent 的 system prompt
 *
 * 优先级：
 * 1. 内存缓存（5分钟内）
 * 2. Langfuse（主数据源）
 * 3. 数据库缓存（备用）
 * 4. null（调用方需要处理）
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

  // 2. 从 Langfuse 获取
  let prompt = await fetchFromLangfuse(agentName);

  // 3. 如果 Langfuse 失败，从数据库获取
  if (!prompt) {
    prompt = await fetchFromDatabase(agentName);
  }

  // 4. 如果都失败，返回 null
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
      console.warn("[PromptManager] Langfuse not available, saving to database only");
      await syncToDatabase(agentName, `xhs-agent-${agentName}`, systemPrompt, 1);
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

    // 同步到数据库（version 使用 1，实际版本由 Langfuse 管理）
    await syncToDatabase(agentName, promptName, systemPrompt, 1);

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

/**
 * 获取所有已配置的 agent prompts
 */
export async function getAllAgentPrompts(): Promise<Map<string, string>> {
  const prompts = new Map<string, string>();

  try {
    const rows = await query<{ agent_name: string; system_prompt: string }>(
      `SELECT agent_name, system_prompt FROM agent_prompts WHERE is_enabled = true`
    );

    for (const row of rows) {
      prompts.set(row.agent_name, row.system_prompt);
    }
  } catch (error) {
    console.error("[PromptManager] Failed to get all prompts", error);
  }

  return prompts;
}

/**
 * 列出所有已注册的 agent
 */
export async function listAgents(): Promise<string[]> {
  try {
    const rows = await query<{ agent_name: string }>(
      `SELECT agent_name FROM agent_prompts WHERE is_enabled = true`
    );
    return rows.map((row) => row.agent_name);
  } catch (error) {
    console.error("[PromptManager] Failed to list agents", error);
    return [];
  }
}

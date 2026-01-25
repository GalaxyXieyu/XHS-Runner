import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenAI } from "@langchain/openai";
import { getDatabase } from "../../db";

// PostgresSaver 单例
let checkpointerInstance: PostgresSaver | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointerInstance) {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL is required for HITL");
    }
    checkpointerInstance = PostgresSaver.fromConnString(dbUrl);
    await checkpointerInstance.setup();
  }
  return checkpointerInstance;
}

// LLM 配置
export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  supportsVision: boolean;
}

export async function getLLMConfig(requireVision = false): Promise<LLMConfig> {
  const db = getDatabase();
  let query = db
    .from("llm_providers")
    .select("base_url, api_key, model_name, max_tokens, supports_vision, supports_image_gen")
    .eq("is_enabled", true);

  if (requireVision) {
    // 优先选择支持视觉且是默认的，否则取第一个支持视觉的
    query = query.eq("supports_vision", true).order("is_default", { ascending: false }).limit(1);
  } else {
    query = query.eq("is_default", true);
  }

  const { data } = await query.maybeSingle();

  if (data?.base_url && data?.api_key && data?.model_name) {
    return {
      baseUrl: data.base_url,
      apiKey: data.api_key,
      model: data.model_name,
      maxTokens: data.max_tokens || 8192,
      supportsVision: !!data.supports_vision,
    };
  }
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    maxTokens: 8192,
    supportsVision: false,
  };
}

// 创建 LLM 实例
export async function createLLM(requireVision = false): Promise<ChatOpenAI> {
  const config = await getLLMConfig(requireVision);
  return new ChatOpenAI({
    configuration: { baseURL: config.baseUrl },
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: requireVision ? 0.3 : 0.7,
    timeout: requireVision ? 120000 : 60000,
    maxRetries: requireVision ? 2 : 3,
    maxTokens: config.maxTokens,
  });
}

import Langfuse from 'langfuse';
import { supabase } from '../supabase';

let langfuseInstance: Langfuse | null = null;
let configCache: LangfuseConfig | null = null;

interface LangfuseConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  enabled: boolean;
}

/**
 * 从数据库获取 Langfuse 配置
 */
async function getLangfuseConfig(): Promise<LangfuseConfig | null> {
  if (configCache) return configCache;

  const { data } = await supabase
    .from('extension_services')
    .select('api_key, endpoint, config_json, is_enabled')
    .eq('service_type', 'langfuse')
    .maybeSingle();

  if (!data) return null;

  const config = typeof data.config_json === 'string'
    ? JSON.parse(data.config_json)
    : (data.config_json as Record<string, any> || {});

  configCache = {
    secretKey: data.api_key || process.env.LANGFUSE_SECRET_KEY || '',
    publicKey: config.public_key || process.env.LANGFUSE_PUBLIC_KEY || '',
    baseUrl: data.endpoint || process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    enabled: data.is_enabled === 1 || data.is_enabled === true,
  };

  return configCache;
}

/**
 * 获取 Langfuse 实例（单例）
 */
export async function getLangfuse(): Promise<Langfuse | null> {
  if (langfuseInstance) return langfuseInstance;

  const config = await getLangfuseConfig();

  if (!config?.enabled || !config.secretKey || !config.publicKey) {
    return null;
  }

  langfuseInstance = new Langfuse({
    secretKey: config.secretKey,
    publicKey: config.publicKey,
    baseUrl: config.baseUrl,
  });

  return langfuseInstance;
}

/**
 * 创建一个新的 trace
 */
export async function createTrace(name: string, metadata?: Record<string, any>) {
  const langfuse = await getLangfuse();
  if (!langfuse) return null;

  return langfuse.trace({
    name,
    metadata,
  });
}

/**
 * 记录 LLM 调用
 */
export async function logGeneration(params: {
  traceId?: string;
  name: string;
  model: string;
  input: any;
  output?: any;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}) {
  const langfuse = await getLangfuse();
  if (!langfuse) return null;

  return langfuse.generation({
    traceId: params.traceId,
    name: params.name,
    model: params.model,
    input: params.input,
    output: params.output,
    startTime: params.startTime,
    endTime: params.endTime,
    metadata: params.metadata,
  });
}

/**
 * 记录 span（用于追踪工具调用等）
 */
export async function logSpan(params: {
  traceId?: string;
  name: string;
  input?: any;
  output?: any;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}) {
  const langfuse = await getLangfuse();
  if (!langfuse) return null;

  return langfuse.span({
    traceId: params.traceId,
    name: params.name,
    input: params.input,
    output: params.output,
    startTime: params.startTime,
    endTime: params.endTime,
    metadata: params.metadata,
  });
}

/**
 * 刷新并关闭 Langfuse（在请求结束时调用）
 */
export async function flushLangfuse() {
  if (langfuseInstance) {
    await langfuseInstance.flushAsync();
  }
}

/**
 * 清除配置缓存（配置更新后调用）
 */
export function clearLangfuseCache() {
  configCache = null;
  langfuseInstance = null;
}

/**
 * 检查 Langfuse 是否启用
 */
export async function isLangfuseEnabled(): Promise<boolean> {
  const config = await getLangfuseConfig();
  return config?.enabled ?? false;
}

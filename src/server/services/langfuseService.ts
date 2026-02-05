import Langfuse from 'langfuse';
import { queryOne } from "../pg";

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
 * 优先级：环境变量 > 数据库配置
 */
async function getLangfuseConfig(): Promise<LangfuseConfig | null> {
  // 1. 先检查环境变量（用户明确配置的环境变量优先）
  const envSecretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const envPublicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const envBaseUrl = process.env.LANGFUSE_BASE_URL?.trim();

  if (envSecretKey && envPublicKey) {
    return {
      secretKey: envSecretKey,
      publicKey: envPublicKey,
      baseUrl: envBaseUrl || 'https://cloud.langfuse.com',
      enabled: true,
    };
  }

  // 2. 使用缓存
  if (configCache) return configCache;

  // 3. 从数据库获取
  const data = await queryOne<{
    api_key: string;
    endpoint: string;
    config_json: string;
    is_enabled: number;
  }>(
    `SELECT api_key, endpoint, config_json, is_enabled
     FROM extension_services
     WHERE service_type = 'langfuse'`
  );

  if (!data) return null;

  const config = typeof data.config_json === 'string'
    ? JSON.parse(data.config_json)
    : (data.config_json as Record<string, any> || {});

  configCache = {
    secretKey: data.api_key || '',
    publicKey: config.public_key || '',
    baseUrl: data.endpoint || 'https://cloud.langfuse.com',
    enabled: data.is_enabled === 1,
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

function buildDatasetName(agentName: string) {
  return `xhs-dataset-${agentName}`;
}

/**
 * 获取 Langfuse 基础 URL
 */
async function getLangfuseBaseUrl(): Promise<string> {
  const config = await getLangfuseConfig();
  return config?.baseUrl || 'https://cloud.langfuse.com';
}

/**
 * 获取认证凭证
 */
async function getAuthHeaders(): Promise<{ 'Content-Type': string; Authorization?: string }> {
  const config = await getLangfuseConfig();
  if (!config) return { 'Content-Type': 'application/json' };

  // Basic Auth 格式
  const auth = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${auth}`,
  };
}

/**
 * 获取或创建指定 agent 的数据集
 */
export async function getOrCreateDataset(agentName: string): Promise<string | null> {
  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.warn('[langfuse] getOrCreateDataset skipped: not enabled');
    return null;
  }

  const datasetName = buildDatasetName(agentName);
  const baseUrl = await getLangfuseBaseUrl();
  const headers = await getAuthHeaders();

  try {
    // 尝试通过 GET 请求检查数据集是否存在
    const response = await fetch(`${baseUrl}/api/public/datasets/${datasetName}`, {
      method: 'GET',
      headers,
    });
    if (response.ok) {
      return datasetName;
    }
  } catch (error) {
    // 继续尝试创建
  }

  try {
    // 数据集不存在，创建新的
    const response = await fetch(`${baseUrl}/api/public/datasets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: datasetName,
        description: `Agent dataset for ${agentName}`,
        metadata: {
          project: 'xhs-generator',
          agent: agentName,
          createdAt: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[langfuse] Failed to create dataset ${datasetName}:`, text);
      return null;
    }

    return datasetName;
  } catch (createError) {
    console.error(`[langfuse] Failed to create dataset ${datasetName}:`, createError);
    return null;
  }
}

/**
 * 添加样本到数据集
 */
export async function addDatasetItem(params: {
  agentName: string;
  input: any;
  output: any;
  traceId?: string;
  observationId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.warn('[langfuse] addDatasetItem skipped: not enabled');
    return;
  }

  try {
    const datasetName = await getOrCreateDataset(params.agentName);
    if (!datasetName) return;

    const baseUrl = await getLangfuseBaseUrl();
    const headers = await getAuthHeaders();

    const response = await fetch(`${baseUrl}/api/public/dataset-items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        datasetName,
        input: params.input,
        expectedOutput: params.output,
        sourceTraceId: params.traceId,
        sourceObservationId: params.observationId,
        metadata: {
          ...params.metadata,
          createdAt: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[langfuse] Failed to add dataset item:', text);
    }
  } catch (error) {
    console.error('[langfuse] Failed to add dataset item:', error);
  }
}

/**
 * 为 trace 添加评分
 */
export async function scoreTrace(params: {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.warn('[langfuse] scoreTrace skipped: not enabled');
    return;
  }

  try {
    const baseUrl = await getLangfuseBaseUrl();
    const headers = await getAuthHeaders();

    const response = await fetch(`${baseUrl}/api/public/scores`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        traceId: params.traceId,
        name: params.name,
        value: params.value,
        comment: params.comment,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[langfuse] Failed to score trace:', text);
    }
  } catch (error) {
    console.error('[langfuse] Failed to score trace:', error);
  }
}

/**
 * 批量评分（用于实验运行后）
 */
export async function scoreExperiment(params: {
  runName: string;
  scores: Array<{ traceId: string; name: string; value: number; comment?: string }>;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.warn('[langfuse] scoreExperiment skipped: not enabled');
    return;
  }

  for (const score of params.scores) {
    await scoreTrace({ ...score });
  }
}

/**
 * Tavily 配置服务
 * 从数据库 extension_services 表读取配置
 */

import { getExtensionServiceByType, upsertExtensionService } from "./extensionService";

// 服务类型标识
export const TAVILY_SERVICE_TYPE = "tavily_search";

// 缓存配置（避免频繁查询数据库）
let cachedApiKey: string | null = null;
let cachedAt: number = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5分钟缓存

export interface TavilyConfig {
  apiKey: string;
  isEnabled: boolean;
}

/**
 * 获取 Tavily 配置（带缓存）
 */
export async function getTavilyConfig(): Promise<TavilyConfig> {
  const now = Date.now();

  // 检查缓存
  if (cachedApiKey !== null && now - cachedAt < CACHE_TTL) {
    return {
      apiKey: cachedApiKey,
      isEnabled: true,
    };
  }

  // 从数据库读取
  const service = await getExtensionServiceByType(TAVILY_SERVICE_TYPE);

  if (service && service.api_key && service.is_enabled) {
    cachedApiKey = service.api_key;
    cachedAt = now;
    return {
      apiKey: service.api_key,
      isEnabled: true,
    };
  }

  // 如果数据库没有配置，回退到环境变量
  const envApiKey = process.env.TAVILY_API_KEY;
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      isEnabled: true,
    };
  }

  return {
    apiKey: "",
    isEnabled: false,
  };
}

/**
 * 保存 Tavily 配置到数据库
 */
export async function saveTavilyConfig(apiKey: string, isEnabled: boolean = true): Promise<void> {
  await upsertExtensionService({
    service_type: TAVILY_SERVICE_TYPE,
    name: "Tavily Search API",
    api_key: apiKey,
    endpoint: "https://api.tavily.com/search",
    is_enabled: isEnabled,
  });

  // 更新缓存
  if (apiKey && isEnabled) {
    cachedApiKey = apiKey;
    cachedAt = Date.now();
  } else {
    cachedApiKey = null;
  }
}

/**
 * 清除配置缓存
 */
export function clearTavilyConfigCache(): void {
  cachedApiKey = null;
  cachedAt = 0;
}

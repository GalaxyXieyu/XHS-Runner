import Redis from 'ioredis';

type RedisCache = {
  __xhsRedisClient?: Redis;
};

function getGlobalCache(): RedisCache {
  return globalThis as RedisCache;
}

function resolveRedisConfig(): { url?: string; host?: string; port?: number; password?: string } {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined;
  const password = process.env.REDIS_AUTH || undefined;

  if (host || port || password) {
    return {
      host: host || '127.0.0.1',
      port: port ?? 23011, // 默认使用项目约定端口
      password,
    };
  }

  return { url: 'redis://127.0.0.1:23011' };
}

export function getRedisClient(): Redis {
  const cache = getGlobalCache();
  if (!cache.__xhsRedisClient) {
    const config = resolveRedisConfig();
    cache.__xhsRedisClient = config.url
      ? new Redis(config.url)
      : new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
        });
  }
  return cache.__xhsRedisClient;
}

export function createRedisSubscriber(): Redis {
  return getRedisClient().duplicate();
}

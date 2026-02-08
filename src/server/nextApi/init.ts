// 统一的 Next.js API 初始化模块 - 避免重复初始化

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureInit() {
  if (initialized) return;

  // 防止并发初始化
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = doInit();
  await initPromise;
}

async function doInit() {
  if (initialized) return;

  // 自动启动调度器
  try {
    const { getScheduler } = await import('../services/scheduler/scheduler');
    const scheduler = getScheduler();
    await scheduler.start();
    console.log('[init] Scheduler started');
  } catch (err) {
    console.error('[init] Failed to start scheduler:', err);
  }

  initialized = true;
}

// 服务缓存
const serviceCache = new Map<string, any>();

export async function getService<T>(name: string, loader: () => Promise<T>): Promise<T> {
  await ensureInit();

  if (serviceCache.has(name)) {
    return serviceCache.get(name);
  }

  const service = await loader();
  serviceCache.set(name, service);
  return service;
}

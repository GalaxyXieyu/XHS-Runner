// 统一的 API 初始化模块 - 避免重复初始化
import path from 'path';
import os from 'os';

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

  const { setUserDataPath } = await import('../../src/server/runtime/userDataPath');

  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);

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

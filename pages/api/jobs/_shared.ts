// 调度器 API 共享初始化
import path from 'path';
import os from 'os';

let initialized = false;
let schedulerModule: any = null;

export async function ensureInit() {
  if (initialized) return;
  const { setUserDataPath } = await import('../../../src/server/runtime/userDataPath');
  const { initializeDatabase } = await import('../../../src/server/db');
  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);
  initializeDatabase();
  initialized = true;
}

export async function getSchedulerModule() {
  await ensureInit();
  if (schedulerModule) return schedulerModule;
  schedulerModule = await import('../../../src/server/services/scheduler');
  return schedulerModule;
}

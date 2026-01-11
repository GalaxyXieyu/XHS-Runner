import path from 'path';
import os from 'os';

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { setUserDataPath } = await import('../../../src/server/runtime/userDataPath');
  const { initializeDatabase } = await import('../../../src/server/db');
  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);
  initializeDatabase();
  initialized = true;
}

let cachedThemeService: any = null;

export async function getThemeService() {
  await ensureInit();
  if (cachedThemeService) return cachedThemeService;
  const mod = await import('../../../src/server/services/xhs/themeService');
  cachedThemeService = mod;
  return cachedThemeService;
}

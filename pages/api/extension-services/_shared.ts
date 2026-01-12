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

let cachedExtensionService: any = null;

export async function getExtensionService() {
  await ensureInit();
  if (cachedExtensionService) return cachedExtensionService;
  const mod = await import('../../../src/server/services/extensionService');
  cachedExtensionService = mod;
  return cachedExtensionService;
}

import path from 'path';

let cachedUserDataPath: string | null = null;

export function setUserDataPath(userDataPath: string) {
  cachedUserDataPath = userDataPath;
}

function resolveFromElectron(): string | null {
  try {
    const electron = require('electron');
    const app = electron?.app;
    if (app?.getPath) {
      return app.getPath('userData');
    }
  } catch (error) {
    return null;
  }
  return null;
}

export function getUserDataPath(): string {
  if (cachedUserDataPath) {
    return cachedUserDataPath;
  }
  const envPath = process.env.XHS_USER_DATA_PATH;
  if (envPath) {
    return envPath;
  }
  const electronPath = resolveFromElectron();
  if (electronPath) {
    return electronPath;
  }
  // 纯 Next.js 环境：使用项目根目录下的 .xhs-data
  return path.join(process.cwd(), '.xhs-data');
}

export function resolveUserDataPath(...segments: string[]): string {
  return path.join(getUserDataPath(), ...segments);
}

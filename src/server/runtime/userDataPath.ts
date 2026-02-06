import path from 'path';
import os from 'os';

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

/**
 * 获取跨平台的用户数据目录
 * - macOS: ~/Library/Application Support/xhs-generator
 * - Windows: %APPDATA%/xhs-generator
 * - Linux: ~/.config/xhs-generator
 */
function getDefaultUserDataPath(): string {
  const platform = os.platform();
  const homedir = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homedir, 'Library', 'Application Support', 'xhs-generator');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), 'xhs-generator');
    default:
      return path.join(homedir, '.config', 'xhs-generator');
  }
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
  // 纯 Next.js 环境：使用跨平台用户数据目录
  return getDefaultUserDataPath();
}

export function resolveUserDataPath(...segments: string[]): string {
  return path.join(getUserDataPath(), ...segments);
}

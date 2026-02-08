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
  // 检查是否在 Electron 环境
  const electronPath = resolveFromElectron();
  if (electronPath) {
    // 只有在 Electron 环境下才使用缓存
    if (cachedUserDataPath) {
      return cachedUserDataPath;
    }
    // 缓存 Electron 路径
    cachedUserDataPath = electronPath;
    return electronPath;
  }

  // 纯 Next.js 环境：使用跨平台用户数据目录（不使用缓存）
  // 这样避免被 Electron 的缓存污染
  return getDefaultUserDataPath();
}

export function resolveUserDataPath(...segments: string[]): string {
  return path.join(getUserDataPath(), ...segments);
}

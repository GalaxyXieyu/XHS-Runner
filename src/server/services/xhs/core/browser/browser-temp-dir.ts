import { mkdtemp, readdir, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { logger } from '../../shared/logger';

const XHS_TEMP_DIR_PREFIX = 'xhs-generator-';
const STALE_PROFILE_THRESHOLD_MS = 30 * 60 * 1000;

export function isNoSpaceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as NodeJS.ErrnoException;
  const message = typeof err.message === 'string' ? err.message : '';
  return err.code === 'ENOSPC' || /no space left on device/i.test(message);
}

export function getBrowserStorageErrorMessage(): string {
  return '临时目录空间不足，无法创建扫码浏览器会话。请清理磁盘空间后重试（可删除 /tmp 下 xhs-generator-* 临时目录）。';
}

export async function createBrowserTempDir(prefix: string): Promise<string> {
  const tempPrefix = join(tmpdir(), prefix);
  try {
    return await mkdtemp(tempPrefix);
  } catch (error) {
    if (!isNoSpaceError(error)) {
      throw error;
    }

    logger.warn(`Failed to create temp browser profile dir (${prefix}) due to ENOSPC, attempting cleanup`);
    const cleanedCount = await cleanupStaleBrowserTempDirs();
    logger.warn(`Cleaned ${cleanedCount} stale browser temp dirs, retrying`);
    return mkdtemp(tempPrefix);
  }
}

async function cleanupStaleBrowserTempDirs(): Promise<number> {
  const rootDir = tmpdir();
  let cleanedCount = 0;

  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(XHS_TEMP_DIR_PREFIX)) {
        continue;
      }

      const dirPath = join(rootDir, entry.name);
      try {
        const stats = await stat(dirPath);
        if (now - stats.mtimeMs < STALE_PROFILE_THRESHOLD_MS) {
          continue;
        }
        await rm(dirPath, { recursive: true, force: true });
        cleanedCount += 1;
      } catch (error) {
        logger.debug(`Skip stale temp dir cleanup for ${dirPath}: ${error}`);
      }
    }
  } catch (error) {
    logger.warn(`Failed to enumerate temp directory for cleanup: ${error}`);
  }

  return cleanedCount;
}

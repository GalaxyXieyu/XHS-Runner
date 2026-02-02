import { getStorageService } from '../../storage';
import { resolveUserDataPath } from '../../../runtime/userDataPath';

const ASSETS_DIR = 'assets';

/**
 * @deprecated Use getStorageService() instead
 */
export function getAssetsPath() {
  return resolveUserDataPath(ASSETS_DIR);
}

/**
 * 存储资源文件
 * 使用统一的存储服务（支持本地存储和 MinIO）
 */
export async function storeAsset({
  type,
  filename,
  data,
  metadata,
}: {
  type: string;
  filename: string;
  data: Buffer;
  metadata?: Record<string, any> | null;
}) {
  const storageService = getStorageService();

  const result = await storageService.storeAsset(data, filename, {
    assetType: type,
    metadata: metadata || undefined,
  });

  return {
    id: result.id,
    path: result.path,
    url: result.url,
  };
}

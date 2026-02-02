import type { NextApiRequest, NextApiResponse } from 'next';
import { StorageService, StorageConfig } from '@/server/services/storage';
import { loadStorageConfig, saveStorageConfig } from '@/server/services/storage/config';

/**
 * 存储配置 API
 * GET - 获取当前存储配置
 * POST - 更新存储配置
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method === 'GET') {
      // 获取当前配置
      const config = await loadStorageConfig();

      // 隐藏敏感信息
      const safeConfig = {
        ...config,
        minio: config.minio ? {
          ...config.minio,
          accessKey: '***',
          secretKey: '***',
        } : undefined,
      };

      return res.status(200).json({
        success: true,
        data: safeConfig,
      });
    }

    if (req.method === 'POST') {
      const newConfig = req.body as StorageConfig;

      // 验证配置
      if (!newConfig.type || !['local', 'minio'].includes(newConfig.type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid storage type',
        });
      }

      if (newConfig.type === 'minio') {
        if (!newConfig.minio?.endpoint || !newConfig.minio?.bucket) {
          return res.status(400).json({
            success: false,
            error: 'MinIO configuration is incomplete',
          });
        }
      }

      // 保存配置
      await saveStorageConfig(newConfig);

      // 重新初始化存储服务
      StorageService.reinitialize(newConfig);

      return res.status(200).json({
        success: true,
        message: 'Storage configuration updated successfully',
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  } catch (error) {
    console.error('Storage config API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

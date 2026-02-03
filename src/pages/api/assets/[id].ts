import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { ensureInit } from '@/server/nextApi/init';
import { db, schema } from '@/server/db';
import { resolveUserDataPath } from '@/server/runtime/userDataPath';
import { loadStorageConfig } from '@/server/services/storage/config';
import { StorageService } from '@/server/services/storage/StorageService';

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await ensureInit();

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'id is required' });
  }

  const [asset] = await db
    .select({ id: schema.assets.id, path: schema.assets.path, type: schema.assets.type })
    .from(schema.assets)
    .where(eq(schema.assets.id, id))
    .limit(1);

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const storageConfig = await loadStorageConfig();
  const storageService = StorageService.reinitialize(storageConfig);

  // 使用代理模式：从存储服务读取内容后返回，而不是重定向
  // 优点：
  // 1. MinIO 只需内网访问，不暴露到公网
  // 2. 统一鉴权控制
  // 3. 前端无需知道存储后端细节
  if (storageConfig.type === 'minio') {
    try {
      // HEAD 请求只返回 headers，不返回内容
      if (req.method === 'HEAD') {
        const exists = await storageService.exists(asset.path);
        if (!exists) {
          return res.status(404).end();
        }
        res.setHeader('Content-Type', guessContentType(asset.path));
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.status(200).end();
      }

      // GET 请求返回完整内容
      const buffer = await storageService.retrieve(asset.path);
      res.setHeader('Content-Type', guessContentType(asset.path));
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.send(buffer);
      return;
    } catch (error: any) {
      // 文件不存在时返回 404
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        console.warn(`[assets] Asset ${id} not found in MinIO: ${asset.path}`);
        return res.status(404).json({ error: 'Asset file not found' });
      }
      // 其他错误返回 502
      console.error('[assets] Failed to retrieve from MinIO:', error);
      return res.status(502).json({ error: 'Failed to fetch asset' });
    }
  }

  const basePath = storageConfig.local?.basePath || resolveUserDataPath('assets');
  const rawPath = path.isAbsolute(asset.path) ? asset.path : path.join(basePath, asset.path);
  const absolutePath = path.resolve(rawPath);
  const resolvedBasePath = path.resolve(basePath);
  // 允许访问的目录列表
  const allowedDirs = [
    resolvedBasePath,
    path.resolve(resolveUserDataPath('assets')),
    path.resolve(process.cwd(), 'assets'),
  ];

  // 仅允许访问允许目录下的文件，避免任意文件读取
  const isAllowed = allowedDirs.some(dir =>
    absolutePath === dir || absolutePath.startsWith(`${dir}${path.sep}`)
  );
  if (!isAllowed) {
    return res.status(403).json({ error: 'Invalid asset path' });
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'Asset file missing' });
  }

  res.setHeader('Content-Type', guessContentType(absolutePath));
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  const stream = fs.createReadStream(absolutePath);
  stream.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[assets] Failed to read asset:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'failed to read asset' });
      return;
    }
    try {
      res.end();
    } catch {
      // ignore
    }
  });
  stream.pipe(res);
}

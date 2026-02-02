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
  if (req.method !== 'GET') {
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

  if (storageConfig.type === 'minio') {
    try {
      const url = await storageService.getUrl(asset.path);
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(302, { Location: url });
      return res.end();
    } catch (error) {
      console.error('[assets] Failed to get MinIO URL:', error);
      return res.status(502).json({ error: 'Failed to fetch asset URL' });
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

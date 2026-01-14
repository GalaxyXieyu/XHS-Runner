import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { ensureInit } from '@/server/nextApi/init';
import { db, schema } from '@/server/db';
import { resolveUserDataPath } from '@/server/runtime/userDataPath';

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

  const absolutePath = path.resolve(asset.path);
  const assetsDir = path.resolve(resolveUserDataPath('assets'));

  // 仅允许访问 userData/assets 目录下的文件，避免任意文件读取
  if (absolutePath !== assetsDir && !absolutePath.startsWith(`${assetsDir}${path.sep}`)) {
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


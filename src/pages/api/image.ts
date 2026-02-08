import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { loadStorageConfig } from '@/server/services/storage/config';
import { StorageService } from '@/server/services/storage/StorageService';

export const config = {
  api: {
    responseLimit: false,
  },
};

const ALLOWED_PREFIXES = ['xhs-capture/'];

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

function normalizePath(param: string | string[] | undefined): string | null {
  if (!param) return null;
  const raw = Array.isArray(param) ? param.join('/') : param;
  const trimmed = raw.replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..')) return null;
  if (!ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return null;
  return trimmed;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.url) {
    return res.status(410).json({ error: 'xhs proxy disabled' });
  }

  const objectPath = normalizePath(req.query.path);
  if (!objectPath) {
    return res.status(400).json({ error: 'invalid path' });
  }

  try {
    const storageConfig = await loadStorageConfig();
    const storageService = StorageService.reinitialize(storageConfig);

    const exists = await storageService.exists(objectPath);
    if (!exists) {
      return res.status(404).json({ error: 'not found' });
    }

    const buffer = await storageService.retrieve(objectPath);
    res.setHeader('Content-Type', guessContentType(objectPath));
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.status(200).send(buffer);
  } catch (error: any) {
    console.error('[image] Failed to serve object:', error?.message || error);
    res.status(502).json({ error: 'storage proxy failed' });
  }
}

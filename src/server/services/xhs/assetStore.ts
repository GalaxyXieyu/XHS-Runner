import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../db';
import { resolveUserDataPath } from '../../runtime/userDataPath';

const ASSETS_DIR = 'assets';

export function getAssetsPath() {
  return resolveUserDataPath(ASSETS_DIR);
}

export function storeAsset({
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
  const db = getDatabase();
  const assetsPath = getAssetsPath();
  fs.mkdirSync(assetsPath, { recursive: true });
  const filePath = path.join(assetsPath, filename);
  fs.writeFileSync(filePath, data);
  const result = db
    .prepare(
      `INSERT INTO assets (type, path, metadata, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .run(type, filePath, metadata ? JSON.stringify(metadata) : null);
  return {
    id: result.lastInsertRowid,
    path: filePath,
  };
}

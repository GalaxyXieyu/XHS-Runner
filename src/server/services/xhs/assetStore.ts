import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../db';
import { resolveUserDataPath } from '../../runtime/userDataPath';

const ASSETS_DIR = 'assets';

export function getAssetsPath() {
  return resolveUserDataPath(ASSETS_DIR);
}

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
  const db = getDatabase();
  const assetsPath = getAssetsPath();
  fs.mkdirSync(assetsPath, { recursive: true });
  const filePath = path.join(assetsPath, filename);
  fs.writeFileSync(filePath, data);

  const { data: inserted, error } = await db
    .from('assets')
    .insert({
      type,
      path: filePath,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .select('id, path')
    .single();
  if (error) throw error;
  return {
    id: inserted.id,
    path: inserted.path,
  };
}

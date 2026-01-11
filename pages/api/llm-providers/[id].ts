import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import os from 'os';

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const { setUserDataPath } = await import('../../../src/server/runtime/userDataPath');
  const { initializeDatabase } = await import('../../../src/server/db');
  const userDataPath = process.env.XHS_USER_DATA_PATH || path.join(os.homedir(), '.xhs-runner');
  setUserDataPath(userDataPath);
  initializeDatabase();
  initialized = true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await ensureInit();
  const { getDatabase } = await import('../../../src/server/db');
  const db = getDatabase();
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, is_enabled, icon } = req.body;

    if (is_default) {
      db.prepare('UPDATE llm_providers SET is_default = 0').run();
    }

    db.prepare(`
      UPDATE llm_providers SET name = ?, provider_type = ?, base_url = ?, api_key = ?, model_name = ?,
      temperature = ?, max_tokens = ?, is_default = ?, is_enabled = ?, icon = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default ? 1 : 0, is_enabled ? 1 : 0, icon, id);

    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

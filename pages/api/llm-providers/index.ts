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

  if (req.method === 'GET') {
    const providers = db.prepare('SELECT * FROM llm_providers ORDER BY is_default DESC, created_at DESC').all();
    return res.json(providers);
  }

  if (req.method === 'POST') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    if (is_default) {
      db.prepare('UPDATE llm_providers SET is_default = 0').run();
    }

    const result = db.prepare(`
      INSERT INTO llm_providers (name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, provider_type || 'openai', base_url, api_key, model_name, temperature ?? 0.7, max_tokens ?? 2048, is_default ? 1 : 0, icon);

    return res.json({ id: result.lastInsertRowid });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

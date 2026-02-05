import type { NextApiRequest, NextApiResponse } from 'next';
import { getDatabase } from '@/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { ids }: { ids?: number[] } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的执行记录 ID 列表' });
    }

    // 限制单次批量删除数量
    if (ids.length > 100) {
      return res.status(400).json({ error: '单次最多删除 100 条记录' });
    }

    const db = getDatabase();
    const { error } = await db.from('job_executions').delete().in('id', ids);
    if (error) throw error;

    return res.status(200).json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

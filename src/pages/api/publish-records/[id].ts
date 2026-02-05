import type { NextApiRequest, NextApiResponse } from 'next';
import { getDatabase } from '@/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: '无效的发布记录 ID' });
  }

  if (req.method === 'DELETE') {
    try {
      const db = getDatabase();
      // 只删除 publish_records 记录
      const { error } = await db.from('publish_records').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[publish-records] delete failed:', error);
      return res.status(500).json({ error: error?.message || '删除失败' });
    }
  }

  res.setHeader('Allow', ['DELETE']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

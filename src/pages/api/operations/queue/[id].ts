import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (req.method === 'GET') {
    // 获取单条记录
    const [record] = await db
      .select()
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.id, id))
      .limit(1);

    if (!record) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({ record });
  }

  if (req.method === 'DELETE') {
    // 删除队列项（只允许删除未发布的）
    const [record] = await db
      .select()
      .from(schema.publishRecords)
      .where(eq(schema.publishRecords.id, id))
      .limit(1);

    if (!record) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (record.status === 'published') {
      return res.status(400).json({ error: '已发布的记录不能删除' });
    }

    await db.delete(schema.publishRecords).where(eq(schema.publishRecords.id, id));

    return res.status(200).json({ success: true, message: '已删除' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

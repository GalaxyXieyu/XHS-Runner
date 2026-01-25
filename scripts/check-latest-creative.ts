import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL not set');
}

async function main() {
  const sql = postgres(DATABASE_URL);

  try {
    // 查询最新的 creative 记录
    const latest = await sql`
      SELECT id, title, LEFT(content, 100) as content_preview, tags, status, created_at
      FROM creatives
      ORDER BY created_at DESC
      LIMIT 5
    `;

    console.log('最新的 5 条创意记录：\n');
    console.table(latest);

    // 检查是否有今天创建的记录
    const today = new Date().toISOString().split('T')[0];
    const todayCount = await sql`
      SELECT COUNT(*) as count
      FROM creatives
      WHERE DATE(created_at) = ${today}
    `;

    console.log(`\n今天创建的记录数: ${todayCount[0].count}`);

  } finally {
    await sql.end();
  }
}

main().catch(console.error);

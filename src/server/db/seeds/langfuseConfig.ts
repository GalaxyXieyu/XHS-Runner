import { db, schema } from '../index';
import { eq } from 'drizzle-orm';

const LANGFUSE_CONFIG = {
  serviceType: 'langfuse',
  name: 'Langfuse',
  apiKey: process.env.LANGFUSE_SECRET_KEY || '',
  endpoint: process.env.LANGFUSE_BASE_URL || 'http://localhost:23022',
  config: {
    public_key: process.env.LANGFUSE_PUBLIC_KEY || '',
  },
  isEnabled: 0, // 默认禁用，需要用户手动启用 (integer: 0=false, 1=true)
};

export async function seedLangfuseConfig() {
  console.log('Seeding Langfuse configuration...');

  const existing = await db
    .select()
    .from(schema.extensionServices)
    .where(eq(schema.extensionServices.serviceType, 'langfuse'))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.extensionServices).values(LANGFUSE_CONFIG);
    console.log('  Created Langfuse configuration');
  } else {
    console.log('  Langfuse configuration already exists');
  }

  console.log('Langfuse configuration seeded');
}

// 直接运行时执行 seed
if (require.main === module) {
  seedLangfuseConfig()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

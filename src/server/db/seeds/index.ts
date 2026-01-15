/**
 * 统一 Seed 入口
 *
 * 用法:
 *   npx tsx src/server/db/seeds/index.ts
 *   npx tsx src/server/db/seeds/index.ts --only agentPrompts
 *   npx tsx src/server/db/seeds/index.ts --only langfuse
 */

import { seedStyleTemplates } from './styleTemplates';
import { seedAgentPrompts } from './agentPrompts';
import { seedLangfuseConfig } from './langfuseConfig';

const SEEDS: Record<string, () => Promise<void>> = {
  styleTemplates: seedStyleTemplates,
  agentPrompts: seedAgentPrompts,
  langfuse: seedLangfuseConfig,
};

async function runSeeds() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf('--only');
  const onlySeeds = onlyIndex >= 0 ? args.slice(onlyIndex + 1) : null;

  console.log('═'.repeat(50));
  console.log('🌱 Running database seeds...');
  console.log('═'.repeat(50));

  for (const [name, seedFn] of Object.entries(SEEDS)) {
    if (onlySeeds && !onlySeeds.includes(name)) {
      console.log(`⏭️  Skipping: ${name}`);
      continue;
    }

    console.log(`\n📦 Running: ${name}`);
    console.log('─'.repeat(50));
    try {
      await seedFn();
      console.log(`✅ ${name} completed`);
    } catch (err) {
      console.error(`❌ ${name} failed:`, err);
      throw err;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ All seeds completed');
  console.log('═'.repeat(50));
}

runSeeds()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });

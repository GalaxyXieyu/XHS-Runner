import dotenv from 'dotenv';
import { expandIdea } from '../services/xhs/llm/ideaExpander';

function parseArgs(argv: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex >= 0) {
      result[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[raw] = next;
      i += 1;
    } else {
      result[raw] = 'true';
    }
  }
  return result;
}

async function main() {
  process.env.DOTENV_CONFIG_QUIET = 'true';
  dotenv.config({ path: ['.env.local', '.env'] });

  const args = parseArgs(process.argv.slice(2));
  const idea = String(args.idea || '').trim();
  const count = Number(args.count) || 3;

  if (!idea) {
    // eslint-disable-next-line no-console
    console.error('Usage: npx tsx src/server/scripts/ideaExpandSmoke.ts --idea "秋天的咖啡馆" --count 3');
    process.exitCode = 2;
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Expanding idea: "${idea}" into ${count} prompts...`);

  const prompts = await expandIdea(idea, count);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ idea, count, prompts }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

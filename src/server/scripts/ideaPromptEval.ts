/**
 * Idea prompts evaluation runner.
 *
 * 用固定样本集 + 固定参数生成 prompts，输出 JSONL 便于 diff 对比与迭代记录。
 *
 * 用法：
 *   npx tsx src/server/scripts/ideaPromptEval.ts
 *   npx tsx src/server/scripts/ideaPromptEval.ts --count 4 --styles cozy,photo --aspectRatio 3:4
 *
 * 注意：不要把任何真实密钥写进命令行参数或仓库文件。
 */

import { renderStyledPrompts, type AspectRatio } from '../services/xhs/llm/styleTemplateService';

type CliOptions = {
  count: number;
  aspectRatio: AspectRatio;
  styles: string[];
  ideas: string[];
};

const DEFAULT_IDEAS = [
  '秋天的咖啡馆：暖色调、窗边光影、治愈氛围',
  '通勤穿搭：简洁干净的搭配示例，实用可复制',
  '周末露营清单：氛围感布置与必备物品',
  '平价护肤：学生党友好、重点成分讲清楚',
  '家居收纳：小空间也能变整洁的技巧',
  '低卡早餐：高颜值又简单易做',
  '学习效率：番茄钟+复盘的日常展示',
  '旅行攻略：城市漫步路线与拍照点位',
];

const DEFAULT_STYLES = ['cozy', 'photo', 'minimal'];

function parseArgs(argv: string[]): Partial<CliOptions> {
  const out: Partial<CliOptions> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--')) continue;
    if (value?.startsWith('--')) continue;

    if (key === '--count') out.count = Math.max(1, Math.min(9, Number(value) || 4));
    if (key === '--aspectRatio') out.aspectRatio = value as AspectRatio;
    if (key === '--styles') out.styles = String(value).split(',').map((s) => s.trim()).filter(Boolean);
    if (key === '--ideas') out.ideas = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options: CliOptions = {
    count: args.count ?? 4,
    aspectRatio: (args.aspectRatio ?? '3:4') as AspectRatio,
    styles: args.styles?.length ? args.styles : DEFAULT_STYLES,
    ideas: args.ideas?.length ? args.ideas : DEFAULT_IDEAS,
  };

  console.log(JSON.stringify({ type: 'meta', options }, null, 2));

  let ok = 0;
  let failed = 0;

  for (const idea of options.ideas) {
    for (const styleKey of options.styles) {
      try {
        const prompts = await renderStyledPrompts({
          idea,
          styleKey,
          aspectRatio: options.aspectRatio,
          count: options.count,
        });
        ok += 1;
        console.log(JSON.stringify({ type: 'result', idea, styleKey, prompts }));
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ type: 'error', idea, styleKey, error: message }));
      }
    }
  }

  console.log(JSON.stringify({ type: 'summary', ok, failed }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ideaPromptEval failed:', err);
  process.exit(1);
});


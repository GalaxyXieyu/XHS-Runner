import { config } from 'dotenv';
import { resolve } from 'path';
import { getLangfuse } from '../src/server/services/langfuseService';
import * as fs from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

interface Sample {
  input: any;
  output: any;
  score: number;
  traceId: string;
}

function getArgValue(args: string[], name: string) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Export high score samples from Langfuse.
 *
 * Usage:
 *   npx tsx scripts/export-good-samples.ts --agent=writer_agent --minScore=0.8 --output=samples/writer.json
 */
async function main() {
  const args = process.argv.slice(2);
  const agentName = getArgValue(args, 'agent');
  const minScore = parseFloat(getArgValue(args, 'minScore') || '0.8');
  const outputFile = getArgValue(args, 'output');

  if (!agentName) {
    console.error('Usage: --agent=<agent_name> [--minScore=0.8] [--output=<path>]');
    process.exit(1);
  }

  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.error('Langfuse not enabled');
    process.exit(1);
  }

  const datasetName = `xhs-dataset-${agentName}`;
  const items = await langfuse.api.datasetItemsList({ datasetName });

  console.log(`Found ${items.data.length} items in ${datasetName}`);

  const goodSamples: Sample[] = [];

  for (const item of items.data) {
    if (!item.sourceTraceId) continue;

    const trace = await langfuse.api.traceGet(item.sourceTraceId);
    const qualityScore = trace.scores?.find((score) => score.name === 'quality');

    if (qualityScore && qualityScore.value >= minScore) {
      goodSamples.push({
        input: item.input,
        output: item.expectedOutput,
        score: qualityScore.value,
        traceId: item.sourceTraceId,
      });
    }
  }

  console.log(`Found ${goodSamples.length} samples with score >= ${minScore}`);

  const output = outputFile || `samples/${agentName}_good_samples.json`;
  await fs.promises.mkdir('samples', { recursive: true });
  await fs.promises.writeFile(output, JSON.stringify(goodSamples, null, 2));

  console.log(`Exported to ${output}`);

  const fewShotExamples = goodSamples.map((sample) => ({
    input: sample.input,
    output: sample.output,
  }));

  const fewShotFile = output.replace('.json', '_fewshot.json');
  await fs.promises.writeFile(fewShotFile, JSON.stringify(fewShotExamples, null, 2));

  console.log(`Few-shot format exported to ${fewShotFile}`);
}

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});

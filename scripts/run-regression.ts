import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type CorpusCase = {
  id: string;
  name?: string;
  mode?: 'fast' | 'normal' | 'both';
  message: string;
  focus?: string;
  refs?: Array<{ spec: string }>;
};

type Corpus = {
  version?: number;
  cases: CorpusCase[];
};

function usage(): string {
  return [
    '',
    'Usage:',
    '  npx tsx scripts/run-regression.ts [--corpus <path>] [--out <dir>] [--limit <n>] [--case <id>] [--dry-run] [--provider <id>]',
    '',
    'Notes:',
    '  - This runner executes scripts/test-agent-api.ts for each case and writes an aggregated report with sample pointers.',
    '  - --dry-run uses a local provider (no network) to still produce evidence + prompt files.',
    '  - For real image providers (ark/jimeng/gemini), you must set env XHS_ALLOW_REAL_IMAGE_CALLS=1.',
    '',
    'Examples:',
    '  npx tsx scripts/run-regression.ts --dry-run --limit 3',
    '  XHS_ALLOW_REAL_IMAGE_CALLS=1 npx tsx scripts/run-regression.ts --provider ark --limit 3',
    '  npx tsx scripts/run-regression.ts --dry-run --case xhs-17',
    '',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};

  const valueFlags = new Set([
    '--corpus',
    '--out',
    '--limit',
    '--case',
    '--provider',
  ]);

  const booleanFlags = new Set([
    '--dry-run',
    '--help',
  ]);

  const known = new Set<string>([...valueFlags, ...booleanFlags]);

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;

    if (a === '-h') {
      flags.add('--help');
      continue;
    }

    if (!a.startsWith('--')) {
      throw new Error(`Unexpected arg: ${a}. Use --help.`);
    }

    if (!known.has(a)) {
      throw new Error(`Unknown flag: ${a}. Use --help.`);
    }

    if (booleanFlags.has(a)) {
      flags.add(a);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${a}. Use --help.`);
    }
    values[a] = next;
    i += 1;
  }

  return { flags, values };
}

function readYamlFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf8');

  // Use whichever YAML parser happens to exist in node_modules (both are common transitives).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('yaml');
    return yaml.parse(raw);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jsYaml = require('js-yaml');
    return jsYaml.load(raw);
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function safeReadJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listIfExists(filePath: string): string[] {
  try {
    return fs.readdirSync(filePath);
  } catch {
    return [];
  }
}

function runCase(opts: {
  caseItem: CorpusCase;
  outRoot: string;
  provider: string;
}) {
  const mode = opts.caseItem.mode === 'normal' ? 'normal' : 'fast';
  const caseOut = path.join(opts.outRoot, opts.caseItem.id);
  const runDir = path.join(caseOut, mode);

  ensureDir(caseOut);

  const args: string[] = [
    'tsx',
    'scripts/test-agent-api.ts',
    mode === 'fast' ? '--fast' : '--normal',
    '--compact',
    '--provider',
    opts.provider,
    '--out',
    caseOut,
    '--message',
    opts.caseItem.message,
  ];

  for (const r of opts.caseItem.refs || []) {
    if (!r?.spec) continue;
    args.push('--ref', r.spec);
  }

  const logPath = path.join(caseOut, 'case.log.txt');
  const child = spawnSync('npx', args, {
    cwd: path.join(process.cwd()),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  fs.writeFileSync(logPath, (child.stdout || '') + (child.stderr || ''), 'utf8');

  return {
    id: opts.caseItem.id,
    name: opts.caseItem.name || '',
    focus: opts.caseItem.focus || '',
    mode,
    ok: child.status === 0,
    exitCode: child.status,
    outDir: caseOut,
    runDir,
    logPath: path.relative(process.cwd(), logPath),
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has('--help')) {
    console.log(usage());
    return;
  }

  const corpusPath = values['--corpus'] || 'tests/regression/xhs-20.yaml';
  const outRoot = values['--out'] || path.join('.xhs-data', 'test-outputs', `${nowStamp()}-regress`);
  const limitRaw = values['--limit'] || '';
  const onlyCase = values['--case'] || '';
  const providerFlag = (values['--provider'] || '').trim();
  const allowRealCalls = process.env.XHS_ALLOW_REAL_IMAGE_CALLS === '1';
  const dryRun = flags.has('--dry-run') || (!allowRealCalls && !providerFlag);
  const provider = providerFlag || (dryRun ? 'dry' : 'ark');

  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    throw new Error(`Invalid --limit ${JSON.stringify(limitRaw)}. Expected a positive number.`);
  }

  const corpus = readYamlFile(corpusPath) as Corpus;
  if (!corpus || !Array.isArray(corpus.cases)) {
    throw new Error(`Invalid corpus file: ${corpusPath}. Expected { cases: [...] }`);
  }

  ensureDir(outRoot);

  let cases = corpus.cases;
  if (onlyCase) cases = cases.filter((c) => c.id === onlyCase);
  if (typeof limit === 'number') cases = cases.slice(0, limit);

  if (cases.length === 0) {
    throw new Error('No cases selected. Check --case/--limit or corpus content.');
  }

  const results: any[] = [];

  for (const c of cases) {
    // Sequential by default to avoid provider bursts; parallelization can be added later.
    const r = runCase({ caseItem: c, outRoot, provider });

    const summaryPath = path.join(r.runDir, 'run-summary.json');
    const evidencePath = path.join(r.runDir, 'run-evidence.json');
    const promptsDir = path.join(r.runDir, 'prompts');

    const summary = safeReadJson(summaryPath);
    const evidence = safeReadJson(evidencePath);

    const images = listIfExists(r.runDir)
      .filter((f) => /^image-\d+\.(png|jpg|jpeg)$/i.test(f))
      .map((f) => path.join(path.relative(process.cwd(), r.runDir), f));

    const promptFiles = listIfExists(promptsDir)
      .filter((f) => f.endsWith('.prompt.txt'))
      .map((f) => path.join(path.relative(process.cwd(), promptsDir), f));

    results.push({
      ...r,
      artifacts: {
        runSummary: fs.existsSync(summaryPath) ? path.relative(process.cwd(), summaryPath) : null,
        runEvidence: fs.existsSync(evidencePath) ? path.relative(process.cwd(), evidencePath) : null,
        eventsJsonl: fs.existsSync(path.join(r.runDir, 'events.jsonl'))
          ? path.relative(process.cwd(), path.join(r.runDir, 'events.jsonl'))
          : null,
        images,
        promptFiles,
      },
      brief: {
        title: summary?.title || '',
        tagCount: Array.isArray(summary?.tags) ? summary.tags.length : undefined,
        imageAssetIds: summary?.imageAssetIds || [],
      },
      evidenceMeta: {
        version: evidence?.version,
        dbOk: evidence?.db?.ok,
        provider: evidence?.images?.[0]?.provider,
        imageModel: evidence?.images?.[0]?.imageModel,
      },
    });
  }

  const reportJsonPath = path.join(outRoot, 'regression-report.json');
  writeJson(reportJsonPath, {
    corpus: path.relative(process.cwd(), corpusPath),
    outRoot: path.relative(process.cwd(), outRoot),
    generatedAt: new Date().toISOString(),
    caseCount: results.length,
    results,
  });

  const reportMdPath = path.join(outRoot, 'regression-report.md');
  const md = [
    '# Regression Report (xhs-20)',
    '',
    `- corpus: \`${path.relative(process.cwd(), corpusPath)}\``,
    `- outRoot: \`${path.relative(process.cwd(), outRoot)}\``,
    `- cases: ${results.length}`,
    '',
    '## Sample Pointers (caseId -> runDir -> key artifacts)',
    '',
    ...results.map((r) => {
      const lines = [
        `- ${r.id} (${r.name || 'unnamed'})`,
        `  - runDir: \`${path.relative(process.cwd(), r.runDir)}\``,
        `  - run-summary: \`${r.artifacts.runSummary || ''}\``,
        `  - run-evidence: \`${r.artifacts.runEvidence || ''}\``,
        `  - prompts: ${r.artifacts.promptFiles.length}`,
        `  - images: ${r.artifacts.images.length}`,
        `  - log: \`${r.logPath}\``,
      ];
      return lines.join('\n');
    }),
    '',
  ].join('\n');
  fs.writeFileSync(reportMdPath, md, 'utf8');

  console.log(`\n✅ Done. Report:`);
  console.log(`- ${path.relative(process.cwd(), reportMdPath)}`);
  console.log(`- ${path.relative(process.cwd(), reportJsonPath)}`);
}

main().catch((err) => {
  console.error('\n❌ regression runner failed:', err);
  process.exit(1);
});

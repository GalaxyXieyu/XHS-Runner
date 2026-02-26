#!/usr/bin/env tsx

/*
 * Sync local prompts/*.yaml into Langfuse prompts.
 *
 * Why: PromptManager fetches Langfuse (label=production) first; local YAML is only a fallback.
 * This script provides the documented workflow to publish prompt changes.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { uploadPromptToLangfuse } from '../src/server/services/promptManager';

// Load local env (DB + Langfuse settings) for scripts.
process.env.DOTENV_CONFIG_QUIET = 'true';
dotenv.config({ path: ['.env.local', '.env'] });

const PROMPTS_DIR = path.resolve(process.cwd(), 'prompts');
const PROMPT_FILE_EXTENSIONS = ['.yaml', '.yml'] as const;

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.set(a, next);
        i += 1;
      } else {
        flags.add(a);
      }
    }
  }

  return { args, flags };
}

function parsePromptBlock(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const promptLineIndex = lines.findIndex((line) => line.trimStart().startsWith('prompt:'));
  if (promptLineIndex < 0) return null;

  const promptLine = lines[promptLineIndex];
  const inlineValue = promptLine.replace(/^\s*prompt:\s*/, '').trim();
  const isBlockStyle = ['|', '|-', '|+', '>', '>-', '>+'].includes(inlineValue);

  if (inlineValue && !isBlockStyle) {
    return inlineValue.replace(/^['"]|['"]$/g, '').trim() || null;
  }

  let baseIndent: number | null = null;
  const promptLines: string[] = [];

  for (let index = promptLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      if (baseIndent === null) continue;
      promptLines.push('');
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (baseIndent === null) {
      baseIndent = indent;
    } else if (indent < baseIndent) {
      break;
    }

    promptLines.push(line.slice(baseIndent));
  }

  const prompt = promptLines.join('\n').trim();
  return prompt || null;
}

async function loadPromptForAgent(agentName: string): Promise<string> {
  for (const ext of PROMPT_FILE_EXTENSIONS) {
    const filePath = path.join(PROMPTS_DIR, `${agentName}${ext}`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const prompt = parsePromptBlock(raw);
      if (!prompt) {
        throw new Error(`prompt block not found in ${filePath}`);
      }
      return prompt;
    } catch (e: any) {
      if (e?.code === 'ENOENT') continue;
      throw e;
    }
  }

  throw new Error(`prompt file not found for agent: ${agentName}`);
}

async function listLocalAgents(): Promise<string[]> {
  const entries = await fs.readdir(PROMPTS_DIR);
  const names = new Set<string>();
  for (const f of entries) {
    const ext = path.extname(f);
    if (!PROMPT_FILE_EXTENSIONS.includes(ext as any)) continue;
    names.add(path.basename(f, ext));
  }
  return [...names].sort();
}

function usage() {
  return [
    '',
    'Usage:',
    '  npx tsx scripts/sync-prompts-to-langfuse.ts [--agent <name>] [--label <production|development>]',
    '',
    'Notes:',
    '  - Label defaults to production (PromptManager fetches label=production).',
    '  - Requires Langfuse to be configured/enabled in the app DB settings.',
    '',
    'Examples:',
    '  npx tsx scripts/sync-prompts-to-langfuse.ts',
    '  npx tsx scripts/sync-prompts-to-langfuse.ts --agent image_planner_agent',
    '  npx tsx scripts/sync-prompts-to-langfuse.ts --agent image_planner_agent --label production',
    '',
  ].join('\n');
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  if (flags.has('--help') || flags.has('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const agent = (args.get('--agent') || '').trim();
  const label = (args.get('--label') || 'production').trim();
  const isProduction = label === 'production';

  if (!['production', 'development'].includes(label)) {
    throw new Error(`invalid --label: ${label}`);
  }

  const agents = agent ? [agent] : await listLocalAgents();

  const results: Array<{ agent: string; ok: boolean; error?: string }> = [];

  for (const a of agents) {
    try {
      const prompt = await loadPromptForAgent(a);
      const ok = await uploadPromptToLangfuse(a, prompt, isProduction);
      results.push({ agent: a, ok });
      // eslint-disable-next-line no-console
      console.log(`[sync-prompts] ${a}: ${ok ? 'OK' : 'SKIP (Langfuse not available?)'}`);
    } catch (e: any) {
      results.push({ agent: a, ok: false, error: String(e?.message || e) });
      // eslint-disable-next-line no-console
      console.error(`[sync-prompts] ${a}: ERROR: ${String(e?.message || e)}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

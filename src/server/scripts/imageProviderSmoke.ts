import fs from 'fs';
import path from 'path';
import { generateImage, ImageModel } from '../services/xhs/integration/imageProvider';

function parseArgs(argv: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex >= 0) {
      const key = raw.slice(0, eqIndex);
      const value = raw.slice(eqIndex + 1);
      result[key] = value;
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

function extensionFromMime(mimeType: string | undefined) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('webp')) return 'webp';
  return 'bin';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = (args.model || 'nanobanana') as ImageModel;
  const prompt = String(args.prompt || '').trim();
  const outArg = args.out ? String(args.out).trim() : '';
  const images = args.images
    ? String(args.images)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;

  if (!prompt) {
    // eslint-disable-next-line no-console
    console.error('Usage: --model <nanobanana|jimeng> --prompt "<text>" [--out <path>] [--images <comma-separated>]');
    process.exitCode = 2;
    return;
  }

  const result = await generateImage({ prompt, model, images });
  const ext = extensionFromMime(String(result.metadata?.mimeType || ''));
  const defaultName = `${model}-${Date.now()}.${ext}`;

  const outPath = outArg
    ? (fs.existsSync(outArg) && fs.statSync(outArg).isDirectory()
        ? path.join(outArg, defaultName)
        : outArg)
    : path.join(process.cwd(), 'temp_images', defaultName);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.imageBuffer);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ outPath, model, text: result.text, metadata: result.metadata }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


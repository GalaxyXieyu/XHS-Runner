import crypto from 'node:crypto';

export type AssetRow = {
  id: number;
  path?: string | null;
  metadata?: unknown;
  createdAt?: unknown;
};

export type RunEvidenceImage = {
  assetId: number;
  assetPath?: string | null;
  sequence: number | null;
  role: string | null;
  provider: string | null;
  imageModel: string | null;
  size: string | null;
  watermark: boolean | null;
  aspectRatio: string | null;
  finalPromptHash: string | null;
  finalPromptPreview: string | null;
  finalPromptPath: string | null;
  referenceImageCount: number | null;
  url: string | null;
  missing?: boolean;
};

export type RunEvidence = {
  version: 2;
  mode: string;
  imageAssetIds: number[];
  promptGeneratorProvider: string | null;
  promptGeneratorModel: string | null;
  images: RunEvidenceImage[];
  missingAssetIds: number[];
};

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function parseAssetMetadata(raw: unknown): Record<string, any> | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as any;
      return null;
    } catch {
      return null;
    }
  }

  if (typeof raw === 'object') return raw as any;
  return null;
}

function coerceString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function coerceBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function extractReferenceImageCount(meta: Record<string, any> | null): number | null {
  if (!meta) return null;

  const direct = coerceNumber(meta.referenceImageCount);
  if (typeof direct === 'number') return direct;

  const candidates = [
    meta.referenceImageUrls,
    meta.referenceImages,
    meta.imageUrls,
    meta.images,
  ];

  for (const v of candidates) {
    if (Array.isArray(v)) return v.length;
  }

  return null;
}

export function buildRunEvidence(params: {
  mode: string;
  imageAssetIds: number[];
  assets: AssetRow[];
  // Optional prompt file paths aligned with imageAssetIds.
  promptPaths?: Array<string | null>;
  // If true, include full prompt in preview (not recommended).
  // Kept for debugging, but default artifacts should stay compact.
  includeFullPrompt?: boolean;
}): RunEvidence {

  const assetById = new Map<number, AssetRow>();
  for (const row of params.assets) {
    if (row && typeof row.id === 'number') assetById.set(row.id, row);
  }

  const images: RunEvidenceImage[] = [];
  const missingAssetIds: number[] = [];

  for (let i = 0; i < params.imageAssetIds.length; i += 1) {
    const assetId = params.imageAssetIds[i];
    const row = assetById.get(assetId);
    const meta = parseAssetMetadata(row?.metadata);

    const finalPrompt = coerceString(meta?.prompt);
    const finalPromptHash = finalPrompt ? sha256Hex(finalPrompt) : null;
    const preview = finalPrompt
      ? (params.includeFullPrompt ? finalPrompt : finalPrompt.slice(0, 300))
      : null;

    const evidence: RunEvidenceImage = {
      assetId,
      assetPath: row?.path ?? null,
      sequence: coerceNumber(meta?.sequence),
      role: coerceString(meta?.role),
      provider: coerceString(meta?.provider),
      imageModel: coerceString(meta?.model),
      size: coerceString(meta?.size),
      watermark: coerceBoolean(meta?.watermark),
      aspectRatio: coerceString(meta?.aspectRatio),
      finalPromptHash,
      finalPromptPreview: preview,
      finalPromptPath: params.promptPaths?.[i] ?? null,
      referenceImageCount: extractReferenceImageCount(meta),
      url: coerceString(meta?.url),
    };

    if (!row) {
      evidence.missing = true;
      missingAssetIds.push(assetId);
    }

    images.push(evidence);
  }

  return {
    version: 2,
    mode: params.mode,
    imageAssetIds: params.imageAssetIds,
    // TODO: expose prompt generator provider/model when we persist prompt LLM metadata.
    promptGeneratorProvider: null,
    promptGeneratorModel: null,
    images,
    missingAssetIds,
  };
}

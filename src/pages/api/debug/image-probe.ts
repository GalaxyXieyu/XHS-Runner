import type { NextApiRequest, NextApiResponse } from 'next';

import { generateImage, generateImageWithReference, type ImageModel, type ReferenceImageProvider } from '../../../server/services/xhs/integration/imageProvider';
import { uploadBase64ToSuperbed } from '../../../server/services/xhs/integration/imageProvider';

type ProbeMode = 'text2img' | 'ref';

type ProbeRequest = {
  mode?: ProbeMode;
  model?: ImageModel | ReferenceImageProvider;
  prompt?: string;
  referenceImageUrls?: string[];
  uploadToSuperbed?: boolean;
  timeoutMs?: number;
};

async function headWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    const elapsedMs = Date.now() - startedAt;
    return {
      ok: res.ok,
      status: res.status,
      elapsedMs,
      headers: {
        'content-type': res.headers.get('content-type'),
        'content-length': res.headers.get('content-length'),
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Dev-only diagnostic endpoint. This calls external model APIs and can spend money.
  if (process.env.ALLOW_DEV_AGENT_API_NO_AUTH !== '1') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN: set ALLOW_DEV_AGENT_API_NO_AUTH=1 to use this endpoint' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const body = (req.body || {}) as ProbeRequest;
  const mode: ProbeMode = body.mode || 'ref';
  const model = (body.model || 'ark') as any;
  const prompt = String(body.prompt || '').trim();
  const referenceImageUrls = Array.isArray(body.referenceImageUrls) ? body.referenceImageUrls.map((u) => String(u || '').trim()).filter(Boolean) : [];
  const uploadToSuperbed = body.uploadToSuperbed !== false; // default true
  const timeoutMs = Math.max(5_000, Math.min(180_000, Number(body.timeoutMs || 30_000)));

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'prompt is required' });
  }

  const startedAt = Date.now();

  try {
    const refChecks = await Promise.all(referenceImageUrls.map((url) => headWithTimeout(url, timeoutMs).then((r) => ({ url, ...r })).catch((e) => ({ url, ok: false, status: 0, elapsedMs: 0, error: String(e?.message || e) }))));

    let imageBuffer: Buffer | null = null;
    let metadata: Record<string, any> = {};

    if (mode === 'text2img') {
      const result = await generateImage({ prompt, model: model as ImageModel, images: referenceImageUrls });
      imageBuffer = result.imageBuffer;
      metadata = result.metadata || {};
    } else {
      const result = await generateImageWithReference({
        prompt,
        referenceImageUrls,
        provider: model as ReferenceImageProvider,
        aspectRatio: '3:4',
      });
      imageBuffer = result.imageBuffer;
      metadata = result.metadata || {};
    }

    if (!imageBuffer) {
      throw new Error('NO_IMAGE_BUFFER');
    }

    const sizeKb = Math.round(imageBuffer.length / 1024);

    let superbedUrl: string | undefined;
    if (uploadToSuperbed) {
      // uploadBase64ToSuperbed will compress and return a direct URL (no 302) when possible.
      superbedUrl = await uploadBase64ToSuperbed(imageBuffer.toString('base64'), `probe-${Date.now()}.png`);
    }

    return res.status(200).json({
      ok: true,
      mode,
      model,
      elapsedMs: Date.now() - startedAt,
      refChecks,
      image: {
        sizeKb,
        superbedUrl,
      },
      metadata,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      mode,
      model,
      elapsedMs: Date.now() - startedAt,
      error: String(e?.message || e),
    });
  }
}

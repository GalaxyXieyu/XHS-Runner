import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager } from '@/server/services/task';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, themeId, enableHITL, referenceImages, imageGenProvider, sourceTaskId } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const themeIdNumber = Number(themeId);
  if (!Number.isFinite(themeIdNumber)) {
    return res.status(400).json({ error: 'themeId is required' });
  }

  const refImages = Array.isArray(referenceImages)
    ? referenceImages
    : referenceImages
      ? [String(referenceImages)]
      : undefined;

  try {
    const result = await taskManager.submitTask({
      message: String(message),
      themeId: themeIdNumber,
      enableHITL: Boolean(enableHITL),
      referenceImages: refImages,
      imageGenProvider: imageGenProvider ? String(imageGenProvider) : undefined,
      sourceTaskId: sourceTaskId ? Number(sourceTaskId) : undefined,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('[tasks] submit failed:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}

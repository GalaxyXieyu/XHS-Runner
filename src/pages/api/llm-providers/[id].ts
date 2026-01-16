import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq, ne } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, is_enabled, icon, supports_vision, supports_image_gen } = req.body;

    const providers = schema.llmProviders;
    const isDefault = Boolean(is_default);
    const isEnabled = Boolean(is_enabled);

    if (isDefault) {
      await db.update(providers).set({ isDefault: false }).where(ne(providers.id, id));
    }

    await db
      .update(providers)
      .set({
        name,
        providerType: provider_type,
        baseUrl: base_url,
        apiKey: api_key,
        modelName: model_name,
        temperature,
        maxTokens: max_tokens,
        isDefault,
        isEnabled,
        icon,
        supportsVision: Boolean(supports_vision),
        supportsImageGen: Boolean(supports_image_gen),
        updatedAt: new Date(),
      })
      .where(eq(providers.id, id));

    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const providers = schema.llmProviders;
    await db.delete(providers).where(eq(providers.id, id));
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

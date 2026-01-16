import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { desc as descOrder, ne } from 'drizzle-orm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const providers = schema.llmProviders;
    const rows = await db
      .select({
        id: providers.id,
        name: providers.name,
        provider_type: providers.providerType,
        base_url: providers.baseUrl,
        api_key: providers.apiKey,
        model_name: providers.modelName,
        temperature: providers.temperature,
        max_tokens: providers.maxTokens,
        is_default: providers.isDefault,
        is_enabled: providers.isEnabled,
        icon: providers.icon,
        supports_vision: providers.supportsVision,
        supports_image_gen: providers.supportsImageGen,
        created_at: providers.createdAt,
        updated_at: providers.updatedAt,
      })
      .from(providers)
      .orderBy(descOrder(providers.isDefault), descOrder(providers.createdAt));

    return res.json(rows || []);
  }

  if (req.method === 'POST') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, icon, supports_vision, supports_image_gen } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const providers = schema.llmProviders;
    const isDefault = Boolean(is_default);

    if (isDefault) {
      await db.update(providers).set({ isDefault: false }).where(ne(providers.id, 0));
    }

    const rows = await db
      .insert(providers)
      .values({
        name: String(name),
        providerType: provider_type || 'openai',
        baseUrl: base_url || null,
        apiKey: api_key || null,
        modelName: model_name || null,
        temperature: temperature ?? 0.7,
        maxTokens: max_tokens ?? 2048,
        isDefault,
        isEnabled: true,
        icon: icon || null,
        supportsVision: Boolean(supports_vision),
        supportsImageGen: Boolean(supports_image_gen),
        updatedAt: new Date(),
      })
      .returning({ id: providers.id });

    return res.json({ id: rows[0]?.id });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

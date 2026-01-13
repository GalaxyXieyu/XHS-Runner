import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../src/server/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, is_enabled, icon } = req.body;

    if (is_default) {
      await supabase.from('llm_providers').update({ is_default: 0 }).neq('id', id);
    }

    const { error } = await supabase
      .from('llm_providers')
      .update({
        name,
        provider_type,
        base_url,
        api_key,
        model_name,
        temperature,
        max_tokens,
        is_default: is_default ? 1 : 0,
        is_enabled: is_enabled ? 1 : 0,
        icon,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('llm_providers').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

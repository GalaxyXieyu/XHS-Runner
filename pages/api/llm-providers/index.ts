import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../src/server/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { data } = await supabase
      .from('llm_providers')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { name, provider_type, base_url, api_key, model_name, temperature, max_tokens, is_default, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    if (is_default) {
      await supabase.from('llm_providers').update({ is_default: 0 }).neq('id', 0);
    }

    const { data, error } = await supabase
      .from('llm_providers')
      .insert({
        name,
        provider_type: provider_type || 'openai',
        base_url,
        api_key,
        model_name,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
        is_default: is_default ? 1 : 0,
        icon
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ id: data.id });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

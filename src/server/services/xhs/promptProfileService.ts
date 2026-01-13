import { supabase } from '../../supabase';

function toNumber(value: any) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listPromptProfiles() {
  const { data } = await supabase
    .from('prompt_profiles')
    .select('id, name, system_prompt, user_template, model, temperature, max_tokens, category, description, created_at, updated_at')
    .order('id', { ascending: false });

  return data || [];
}

export async function getPromptProfile(id: number) {
  if (!id) {
    throw new Error('promptProfiles:get requires id');
  }
  const { data } = await supabase
    .from('prompt_profiles')
    .select('id, name, system_prompt, user_template, model, temperature, max_tokens, category, description, created_at, updated_at')
    .eq('id', id)
    .single();

  return data;
}

export async function createPromptProfile(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('promptProfiles:create expects an object payload');
  }
  const name = String(payload.name || '').trim();
  const systemPrompt = String(payload.system_prompt || payload.systemPrompt || '').trim();
  const userTemplate = String(payload.user_template || payload.userTemplate || '').trim();

  if (!name) {
    throw new Error('Prompt profile name is required');
  }
  if (!systemPrompt) {
    throw new Error('system_prompt is required');
  }
  if (!userTemplate) {
    throw new Error('user_template is required');
  }

  const { data, error } = await supabase
    .from('prompt_profiles')
    .insert({
      name,
      system_prompt: systemPrompt,
      user_template: userTemplate,
      model: payload.model ? String(payload.model) : null,
      temperature: toNumber(payload.temperature),
      max_tokens: toNumber(payload.max_tokens ?? payload.maxTokens),
      category: payload.category ? String(payload.category) : null,
      description: payload.description ? String(payload.description) : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePromptProfile(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('promptProfiles:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('promptProfiles:update requires id');
  }

  const updateData: any = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updateData.name = String(payload.name);
  if (payload.system_prompt !== undefined || payload.systemPrompt !== undefined) {
    updateData.system_prompt = String(payload.system_prompt || payload.systemPrompt);
  }
  if (payload.user_template !== undefined || payload.userTemplate !== undefined) {
    updateData.user_template = String(payload.user_template || payload.userTemplate);
  }
  if (payload.model !== undefined) updateData.model = payload.model ? String(payload.model) : null;
  if (payload.temperature !== undefined) updateData.temperature = toNumber(payload.temperature);
  if (payload.max_tokens !== undefined || payload.maxTokens !== undefined) {
    updateData.max_tokens = toNumber(payload.max_tokens ?? payload.maxTokens);
  }
  if (payload.category !== undefined) updateData.category = payload.category ? String(payload.category) : null;
  if (payload.description !== undefined) updateData.description = payload.description ? String(payload.description) : null;

  const { data, error } = await supabase
    .from('prompt_profiles')
    .update(updateData)
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePromptProfile(id: number): Promise<boolean> {
  if (!id) {
    throw new Error('promptProfiles:delete requires id');
  }
  const { error } = await supabase
    .from('prompt_profiles')
    .delete()
    .eq('id', id);

  return !error;
}

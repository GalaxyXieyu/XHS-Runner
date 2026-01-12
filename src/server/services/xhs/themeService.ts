import { supabase } from '../../supabase';

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function listThemeKeywords(themeId: number) {
  const { data } = await supabase
    .from('keywords')
    .select('id, value, keyword, source, status, created_at, updated_at')
    .eq('theme_id', themeId)
    .order('id', { ascending: false });

  return (data || []).map((row: any) => ({
    ...row,
    value: row.keyword || row.value
  }));
}

async function listThemeCompetitors(themeId: number) {
  const { data } = await supabase
    .from('competitors')
    .select('id, xhs_user_id, name, last_monitored_at, created_at, updated_at')
    .eq('theme_id', themeId)
    .order('id', { ascending: false });

  return data || [];
}

export async function listThemes() {
  const { data: themes } = await supabase
    .from('themes')
    .select('id, name, description, status, analytics_json, config_json, created_at, updated_at')
    .order('id', { ascending: false });

  const results = await Promise.all(
    (themes || []).map(async (theme: any) => ({
      ...theme,
      analytics: parseJson(theme.analytics_json),
      config: parseJson(theme.config_json),
      keywords: await listThemeKeywords(theme.id),
      competitors: await listThemeCompetitors(theme.id),
    }))
  );

  return results;
}

export async function createTheme(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('themes:create expects an object payload');
  }
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('Theme name is required');
  }

  const { data: theme } = await supabase
    .from('themes')
    .insert({
      name,
      description: payload.description || null,
      status: payload.status || 'active',
      analytics_json: payload.analytics ? JSON.stringify(payload.analytics) : null,
      config_json: payload.config ? JSON.stringify(payload.config) : null,
    })
    .select()
    .single();

  const themeId = theme!.id;

  if (Array.isArray(payload.keywords)) {
    const keywordRows = payload.keywords
      .map((v: any) => String(v || '').trim())
      .filter(Boolean)
      .map((value: string) => ({
        theme_id: themeId,
        value,
        keyword: value,
        source: 'manual',
        status: 'active',
        is_enabled: 1
      }));

    if (keywordRows.length > 0) {
      await supabase.from('keywords').insert(keywordRows);
    }
  }

  if (Array.isArray(payload.competitors)) {
    const competitorRows = payload.competitors
      .map((c: any) => {
        const entry = typeof c === 'object' ? c : { name: c };
        return {
          theme_id: themeId,
          xhs_user_id: entry?.xhs_user_id || null,
          name: entry?.name || null
        };
      })
      .filter((r: any) => r.name || r.xhs_user_id);

    if (competitorRows.length > 0) {
      await supabase.from('competitors').insert(competitorRows);
    }
  }

  return {
    ...theme,
    analytics: parseJson(theme?.analytics_json ?? null),
    config: parseJson(theme?.config_json ?? null),
  };
}

export async function updateTheme(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('themes:update expects an object payload');
  }
  if (!payload.id) {
    throw new Error('themes:update requires id');
  }

  const updateData: any = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.analytics !== undefined) updateData.analytics_json = JSON.stringify(payload.analytics);
  if (payload.config !== undefined) updateData.config_json = JSON.stringify(payload.config);

  const { data: theme } = await supabase
    .from('themes')
    .update(updateData)
    .eq('id', payload.id)
    .select()
    .single();

  return {
    ...theme,
    analytics: parseJson(theme?.analytics_json ?? null),
    config: parseJson(theme?.config_json ?? null),
  };
}

export async function removeTheme(id: number) {
  if (!id) {
    throw new Error('themes:remove requires id');
  }

  await supabase.from('keywords').delete().eq('theme_id', id);
  await supabase.from('competitors').delete().eq('theme_id', id);
  await supabase.from('themes').delete().eq('id', id);

  return { id };
}

export async function setThemeStatus(id: number, status: string) {
  if (!id) {
    throw new Error('themes:setStatus requires id');
  }

  const { data } = await supabase
    .from('themes')
    .update({ status: status || 'active', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status')
    .single();

  return data;
}

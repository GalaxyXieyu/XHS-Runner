import { getDatabase } from '../../../db';

export async function listCompetitors(themeId: number) {
  if (!themeId) {
    throw new Error('competitors:list requires themeId');
  }
  const db = getDatabase();
  const { data, error } = await db
    .from('competitors')
    .select('id, theme_id, xhs_user_id, name, last_monitored_at, created_at, updated_at')
    .eq('theme_id', themeId)
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addCompetitor(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('competitors:add expects an object payload');
  }
  if (!payload.themeId) {
    throw new Error('competitors:add requires themeId');
  }
  const xhsUserId = payload.xhsUserId ? String(payload.xhsUserId) : null;
  const name = payload.name ? String(payload.name) : null;
  if (!xhsUserId && !name) {
    throw new Error('competitors:add requires name or xhsUserId');
  }
  const db = getDatabase();
  const { data, error } = await db
    .from('competitors')
    .insert({
      theme_id: payload.themeId,
      xhs_user_id: xhsUserId,
      name,
      updated_at: new Date().toISOString(),
    })
    .select('id, theme_id, xhs_user_id, name, last_monitored_at, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function removeCompetitor(id: number) {
  if (!id) {
    throw new Error('competitors:remove requires id');
  }
  const db = getDatabase();
  const { error } = await db.from('competitors').delete().eq('id', id);
  if (error) throw error;
  return { id };
}

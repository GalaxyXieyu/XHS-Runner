import { getDatabase } from '../../../db';

function parseJson(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

export async function listFormAssists(themeId?: number) {
  const db = getDatabase();
  const selectColumns = 'id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at';

  const query = themeId
    ? db.from('form_assist_records').select(selectColumns).eq('theme_id', themeId).order('id', { ascending: false })
    : db.from('form_assist_records').select(selectColumns).order('id', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    suggestion: parseJson(row.suggestion_json),
    applied: parseJson(row.applied_json),
    feedback: parseJson(row.feedback_json),
  }));
}

export async function generateSuggestion(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:generate expects an object payload');
  }
  if (!payload.themeId) {
    throw new Error('formAssist:generate requires themeId');
  }

  const suggestion = {
    title: payload.titleHint ? `建议标题：${payload.titleHint}` : '建议标题：小红书爆款主题',
    content: payload.contentHint || '建议正文：请根据主题补充内容。',
    tags: payload.tags || [],
  };

  const db = getDatabase();
  const insertRow = {
    theme_id: payload.themeId,
    suggestion_json: JSON.stringify(suggestion),
    status: 'suggested',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('form_assist_records')
    .insert(insertRow)
    .select('id, theme_id, status')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    theme_id: data.theme_id,
    suggestion,
    status: data.status,
  };
}

export async function applySuggestion(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:apply expects an object payload');
  }
  if (!payload.id) {
    throw new Error('formAssist:apply requires id');
  }

  const db = getDatabase();
  const appliedJson = JSON.stringify(payload.applied || {});
  const selectColumns = 'id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at';

  const { data, error } = await db
    .from('form_assist_records')
    .update({ applied_json: appliedJson, status: 'applied', updated_at: new Date().toISOString() })
    .eq('id', payload.id)
    .select(selectColumns)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Form assist record not found');
  return {
    ...data,
    suggestion: parseJson(data.suggestion_json),
    applied: parseJson(data.applied_json),
    feedback: parseJson(data.feedback_json),
  };
}

export async function saveFeedback(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('formAssist:feedback expects an object payload');
  }
  if (!payload.id) {
    throw new Error('formAssist:feedback requires id');
  }

  const db = getDatabase();
  const feedbackJson = JSON.stringify(payload.feedback || {});
  const selectColumns = 'id, theme_id, suggestion_json, applied_json, feedback_json, status, created_at, updated_at';

  const { data, error } = await db
    .from('form_assist_records')
    .update({ feedback_json: feedbackJson, status: 'feedback', updated_at: new Date().toISOString() })
    .eq('id', payload.id)
    .select(selectColumns)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Form assist record not found');
  return {
    ...data,
    suggestion: parseJson(data.suggestion_json),
    applied: parseJson(data.applied_json),
    feedback: parseJson(data.feedback_json),
  };
}

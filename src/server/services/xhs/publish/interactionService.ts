import { getDatabase } from '../../../db';

export async function listInteractions(publishRecordId?: number) {
  const db = getDatabase();
  const selectColumns = 'id, publish_record_id, type, status, content, created_at, updated_at';

  if (publishRecordId) {
    const { data, error } = await db
      .from('interaction_tasks')
      .select(selectColumns)
      .eq('publish_record_id', publishRecordId)
      .order('id', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const { data, error } = await db
    .from('interaction_tasks')
    .select(selectColumns)
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function enqueueInteraction(payload: Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('interactions:enqueue expects an object payload');
  }
  if (!payload.publishRecordId) {
    throw new Error('interactions:enqueue requires publishRecordId');
  }
  if (!payload.type) {
    throw new Error('interactions:enqueue requires type');
  }

  const db = getDatabase();
  const insertRow = {
    publish_record_id: payload.publishRecordId,
    type: payload.type,
    status: 'queued',
    content: payload.content || null,
    updated_at: new Date().toISOString(),
  };

  const selectColumns = 'id, publish_record_id, type, status, content, created_at, updated_at';

  const { data, error } = await db
    .from('interaction_tasks')
    .insert(insertRow)
    .select(selectColumns)
    .single();
  if (error) throw error;
  return data;
}

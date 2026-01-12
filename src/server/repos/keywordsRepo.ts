import { getDatabase, getDbProvider } from '../db';

type KeywordRow = {
  id: number;
  value: string;
  is_enabled: number;
  created_at?: string;
  updated_at?: string;
};

function normalizeKeywordRow(row: any): KeywordRow {
  return {
    id: Number(row.id),
    value: String(row.value),
    is_enabled: Number(row.is_enabled ?? row.isEnabled ?? 1),
    created_at: row.created_at ?? row.createdAt,
    updated_at: row.updated_at ?? row.updatedAt,
  };
}

export async function listKeywords(): Promise<KeywordRow[]> {
  const provider = getDbProvider();
  const db = getDatabase();

  if (provider === 'sqlite') {
    const rows = db
      .prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords ORDER BY id DESC')
      .all();
    return rows.map(normalizeKeywordRow);
  }

  const { data, error } = await db
    .from('keywords')
    .select('id, value, is_enabled, created_at, updated_at')
    .order('id', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeKeywordRow);
}

export async function addKeyword(value: string): Promise<KeywordRow> {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error('Keyword value is required');
  }

  const provider = getDbProvider();
  const db = getDatabase();

  if (provider === 'sqlite') {
    db.prepare(
      `INSERT INTO keywords (value, is_enabled, created_at, updated_at)
       VALUES (?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(value) DO UPDATE SET
         is_enabled = excluded.is_enabled,
         updated_at = excluded.updated_at`
    ).run(trimmed);

    const row = db
      .prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords WHERE value = ?')
      .get(trimmed);
    return normalizeKeywordRow(row);
  }

  const { data: inserted, error } = await db
    .from('keywords')
    .insert({ value: trimmed, is_enabled: 1 })
    .select('id, value, is_enabled, created_at, updated_at')
    .single();

  if (error) throw error;
  return normalizeKeywordRow(inserted);
}

export async function updateKeyword(id: number, value: string, isEnabled?: number | boolean): Promise<KeywordRow> {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error('Keyword value is required');
  }

  const provider = getDbProvider();
  const db = getDatabase();

  if (provider === 'sqlite') {
    db.prepare(
      `UPDATE keywords
       SET value = ?, is_enabled = COALESCE(?, is_enabled), updated_at = datetime('now')
       WHERE id = ?`
    ).run(trimmed, isEnabled as any, id);

    const row = db
      .prepare('SELECT id, value, is_enabled, created_at, updated_at FROM keywords WHERE id = ?')
      .get(id);
    return normalizeKeywordRow(row);
  }

  const updatePayload: Record<string, any> = { value: trimmed };
  if (isEnabled !== undefined) {
    updatePayload.is_enabled = isEnabled ? 1 : 0;
  }

  const { data: updated, error } = await db
    .from('keywords')
    .update(updatePayload)
    .eq('id', id)
    .select('id, value, is_enabled, created_at, updated_at')
    .single();

  if (error) throw error;
  return normalizeKeywordRow(updated);
}

export async function removeKeyword(id: number): Promise<{ id: number }> {
  if (!id) {
    throw new Error('removeKeyword requires id');
  }

  const provider = getDbProvider();
  const db = getDatabase();

  if (provider === 'sqlite') {
    db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
    return { id };
  }

  const { error } = await db.from('keywords').delete().eq('id', id);
  if (error) throw error;
  return { id };
}


import { getDatabase } from '../db';

export interface ExtensionService {
  id: number;
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export function listExtensionServices(): ExtensionService[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM extension_services ORDER BY id').all();
}

export function getExtensionService(id: number): ExtensionService | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM extension_services WHERE id = ?').get(id);
}

export function getExtensionServiceByType(serviceType: string): ExtensionService | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM extension_services WHERE service_type = ?').get(serviceType);
}

export function createExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): ExtensionService {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO extension_services (service_type, name, api_key, endpoint, config_json, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    payload.service_type,
    payload.name,
    payload.api_key || null,
    payload.endpoint || null,
    payload.config_json || null,
    payload.is_enabled ? 1 : 0
  );
  return getExtensionService(result.lastInsertRowid as number)!;
}

export function updateExtensionService(id: number, payload: {
  name?: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): ExtensionService | undefined {
  const db = getDatabase();
  const existing = getExtensionService(id);
  if (!existing) return undefined;

  db.prepare(`
    UPDATE extension_services SET
      name = COALESCE(?, name),
      api_key = COALESCE(?, api_key),
      endpoint = COALESCE(?, endpoint),
      config_json = COALESCE(?, config_json),
      is_enabled = COALESCE(?, is_enabled),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    payload.name,
    payload.api_key,
    payload.endpoint,
    payload.config_json,
    payload.is_enabled !== undefined ? (payload.is_enabled ? 1 : 0) : undefined,
    id
  );
  return getExtensionService(id);
}

export function upsertExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): ExtensionService {
  const existing = getExtensionServiceByType(payload.service_type);
  if (existing) {
    return updateExtensionService(existing.id, payload)!;
  }
  return createExtensionService(payload);
}

export function deleteExtensionService(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM extension_services WHERE id = ?').run(id);
  return result.changes > 0;
}

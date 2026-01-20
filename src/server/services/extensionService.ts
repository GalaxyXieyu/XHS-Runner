import { query, queryOne, getPool } from "../pg";

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

export async function listExtensionServices(): Promise<ExtensionService[]> {
  return query<ExtensionService>(
    `SELECT * FROM extension_services ORDER BY id`
  );
}

export async function getExtensionService(id: number): Promise<ExtensionService | undefined> {
  return queryOne<ExtensionService>(
    `SELECT * FROM extension_services WHERE id = $1`,
    [id]
  );
}

export async function getExtensionServiceByType(serviceType: string): Promise<ExtensionService | undefined> {
  return queryOne<ExtensionService>(
    `SELECT * FROM extension_services WHERE service_type = $1`,
    [serviceType]
  );
}

export async function createExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO extension_services (service_type, name, api_key, endpoint, config_json, is_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING *`,
    [
      payload.service_type,
      payload.name,
      payload.api_key || null,
      payload.endpoint || null,
      payload.config_json || null,
      payload.is_enabled ? 1 : 0
    ]
  );
  return result.rows[0] as ExtensionService;
}

export async function updateExtensionService(id: number, payload: {
  name?: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService | undefined> {
  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  if (payload.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(payload.name);
  }
  if (payload.api_key !== undefined) {
    updates.push(`api_key = $${paramIndex++}`);
    values.push(payload.api_key);
  }
  if (payload.endpoint !== undefined) {
    updates.push(`endpoint = $${paramIndex++}`);
    values.push(payload.endpoint);
  }
  if (payload.config_json !== undefined) {
    updates.push(`config_json = $${paramIndex++}`);
    values.push(payload.config_json);
  }
  if (payload.is_enabled !== undefined) {
    updates.push(`is_enabled = $${paramIndex++}`);
    values.push(payload.is_enabled ? 1 : 0);
  }

  values.push(id);

  return queryOne<ExtensionService>(
    `UPDATE extension_services SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
}

export async function upsertExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO extension_services (service_type, name, api_key, endpoint, config_json, is_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (service_type)
     DO UPDATE SET
       name = EXCLUDED.name,
       api_key = EXCLUDED.api_key,
       endpoint = EXCLUDED.endpoint,
       config_json = EXCLUDED.config_json,
       is_enabled = EXCLUDED.is_enabled,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      payload.service_type,
      payload.name,
      payload.api_key || null,
      payload.endpoint || null,
      payload.config_json || null,
      payload.is_enabled ? 1 : 0
    ]
  );
  return result.rows[0] as ExtensionService;
}

export async function deleteExtensionService(id: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM extension_services WHERE id = $1`,
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

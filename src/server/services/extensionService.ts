import { supabase } from '../supabase';

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
  const { data } = await supabase
    .from('extension_services')
    .select('*')
    .order('id');
  return data || [];
}

export async function getExtensionService(id: number): Promise<ExtensionService | undefined> {
  const { data } = await supabase
    .from('extension_services')
    .select('*')
    .eq('id', id)
    .single();
  return data || undefined;
}

export async function getExtensionServiceByType(serviceType: string): Promise<ExtensionService | undefined> {
  const { data } = await supabase
    .from('extension_services')
    .select('*')
    .eq('service_type', serviceType)
    .single();
  return data || undefined;
}

export async function createExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService> {
  const { data } = await supabase
    .from('extension_services')
    .insert({
      service_type: payload.service_type,
      name: payload.name,
      api_key: payload.api_key || null,
      endpoint: payload.endpoint || null,
      config_json: payload.config_json || null,
      is_enabled: payload.is_enabled ? 1 : 0
    })
    .select()
    .single();
  return data!;
}

export async function updateExtensionService(id: number, payload: {
  name?: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService | undefined> {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.api_key !== undefined) updateData.api_key = payload.api_key;
  if (payload.endpoint !== undefined) updateData.endpoint = payload.endpoint;
  if (payload.config_json !== undefined) updateData.config_json = payload.config_json;
  if (payload.is_enabled !== undefined) updateData.is_enabled = payload.is_enabled ? 1 : 0;

  const { data } = await supabase
    .from('extension_services')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  return data || undefined;
}

export async function upsertExtensionService(payload: {
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<ExtensionService> {
  const { data } = await supabase
    .from('extension_services')
    .upsert({
      service_type: payload.service_type,
      name: payload.name,
      api_key: payload.api_key || null,
      endpoint: payload.endpoint || null,
      config_json: payload.config_json || null,
      is_enabled: payload.is_enabled ? 1 : 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'service_type' })
    .select()
    .single();
  return data!;
}

export async function deleteExtensionService(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('extension_services')
    .delete()
    .eq('id', id);
  return !error;
}

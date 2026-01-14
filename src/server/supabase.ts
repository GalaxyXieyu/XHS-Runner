import { createClient } from '@supabase/supabase-js';

let cachedClient: any = null;

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_NOT_CONFIGURED: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  cachedClient = createSupabaseClient();
  return cachedClient;
}

export const supabase: any = new Proxy({}, {
  get(_target, prop) {
    const client = getSupabaseClient() as any;
    return client[prop];
  },
});

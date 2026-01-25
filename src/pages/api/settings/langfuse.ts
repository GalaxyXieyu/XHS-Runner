import { NextApiRequest, NextApiResponse } from 'next';
import { getDatabase } from '@/server/db';
import { clearLangfuseCache, isLangfuseEnabled } from '@/server/services/langfuseService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDatabase();
  if (req.method === 'GET') {
    try {
      const { data } = await db
        .from('extension_services')
        .select('id, name, api_key, endpoint, config_json, is_enabled')
        .eq('service_type', 'langfuse')
        .maybeSingle();

      if (!data) {
        return res.json({
          configured: false,
          enabled: false,
        });
      }

      const config = typeof data.config_json === 'string'
        ? JSON.parse(data.config_json)
        : (data.config_json as Record<string, any> || {});

      return res.json({
        configured: true,
        enabled: data.is_enabled,
        endpoint: data.endpoint,
        publicKey: config.public_key || '',
        // 不返回 secret key，只返回是否已配置
        hasSecretKey: !!data.api_key,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PUT') {
    const { secretKey, publicKey, endpoint, enabled } = req.body;

    try {
      // 检查是否已存在配置
      const { data: existing } = await db
        .from('extension_services')
        .select('id')
        .eq('service_type', 'langfuse')
        .maybeSingle();

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (secretKey !== undefined) updateData.api_key = secretKey;
      if (endpoint !== undefined) updateData.endpoint = endpoint;
      if (enabled !== undefined) updateData.is_enabled = enabled ? 1 : 0;
      if (publicKey !== undefined) {
        updateData.config_json = JSON.stringify({ public_key: publicKey });
      }

      if (existing) {
        await db
          .from('extension_services')
          .update(updateData)
          .eq('service_type', 'langfuse');
      } else {
        await db.from('extension_services').insert({
          service_type: 'langfuse',
          name: 'Langfuse',
          api_key: secretKey || '',
          endpoint: endpoint || 'http://localhost:23022',
          config_json: JSON.stringify({ public_key: publicKey || '' }),
          is_enabled: enabled ? 1 : 0,
        });
      }

      // 清除缓存以使新配置生效
      clearLangfuseCache();

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST' && req.body.action === 'test') {
    try {
      const enabled = await isLangfuseEnabled();
      return res.json({
        success: true,
        enabled,
        message: enabled ? 'Langfuse is configured and enabled' : 'Langfuse is not enabled',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

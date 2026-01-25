import { NextApiRequest, NextApiResponse } from 'next';
import { getDatabase } from '@/server/db';
import { clearTavilyConfigCache, getTavilyConfig } from '@/server/services/tavilyService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDatabase();
  if (req.method === 'GET') {
    try {
      const { data } = await db
        .from('extension_services')
        .select('id, name, api_key, endpoint, is_enabled')
        .eq('service_type', 'tavily_search')
        .maybeSingle();

      if (!data) {
        return res.json({
          configured: false,
          enabled: false,
        });
      }

      return res.json({
        configured: true,
        enabled: !!data.is_enabled,
        endpoint: data.endpoint || 'https://api.tavily.com/search',
        // 不返回 API key，只返回是否已配置
        hasApiKey: !!data.api_key,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'PUT') {
    const { apiKey, endpoint, enabled } = req.body;

    try {
      // 检查是否已存在配置
      const { data: existing } = await db
        .from('extension_services')
        .select('id')
        .eq('service_type', 'tavily_search')
        .maybeSingle();

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (apiKey !== undefined) updateData.api_key = apiKey;
      if (endpoint !== undefined) updateData.endpoint = endpoint;
      if (enabled !== undefined) updateData.is_enabled = enabled ? 1 : 0;

      if (existing) {
        await db
          .from('extension_services')
          .update(updateData)
          .eq('service_type', 'tavily_search');
      } else {
        await db.from('extension_services').insert({
          service_type: 'tavily_search',
          name: 'Tavily Search API',
          api_key: apiKey || '',
          endpoint: endpoint || 'https://api.tavily.com/search',
          is_enabled: enabled ? 1 : 0,
        });
      }

      // 清除缓存以使新配置生效
      clearTavilyConfigCache();

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST' && req.body.action === 'test') {
    try {
      const config = await getTavilyConfig();
      return res.json({
        success: true,
        enabled: config.isEnabled,
        hasApiKey: !!config.apiKey,
        message: config.isEnabled && config.apiKey
          ? 'Tavily is configured and enabled'
          : 'Tavily API Key not configured',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

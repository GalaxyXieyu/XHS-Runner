export interface LLMConfig {
  id: number;
  name: string;
  provider_type: string;
  model_name: string;
  base_url?: string;
  api_key?: string;
  configured: boolean;
  supports_vision?: boolean;
  supports_image_gen?: boolean;
}

export interface ExtensionService {
  id: number;
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  is_enabled: number;
}

export interface LangfuseConfig {
  configured: boolean;
  enabled: boolean;
  endpoint: string;
  publicKey: string;
  hasSecretKey: boolean;
}

export interface TavilyConfig {
  configured: boolean;
  enabled: boolean;
  endpoint: string;
  hasApiKey: boolean;
}

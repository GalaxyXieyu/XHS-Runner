let cachedAuthService: any = null;

export async function getAuthService() {
  if (cachedAuthService) return cachedAuthService;
  const mod = await import('../../../electron/mcp/xhs-core/dist/index.js') as any;
  const config = mod.getConfig();
  cachedAuthService = new mod.AuthService(config);
  return cachedAuthService;
}

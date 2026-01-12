import { getConfig } from '../../../src/server/services/xhs/shared/config';
import { AuthService } from '../../../src/server/services/xhs/core/auth';

let cachedAuthService: AuthService | null = null;

export function getAuthService() {
  if (cachedAuthService) return cachedAuthService;
  const config = getConfig();
  cachedAuthService = new AuthService(config);
  return cachedAuthService;
}

import { getConfig } from '../../shared/config';
import { AuthService } from './auth.service';

let cachedAuthService: AuthService | null = null;

export function getAuthService(): AuthService {
  if (cachedAuthService) return cachedAuthService;
  const config = getConfig();
  cachedAuthService = new AuthService(config);
  return cachedAuthService;
}

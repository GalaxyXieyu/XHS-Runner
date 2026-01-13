import { getService } from '../_init';

export async function getThemeService() {
  return getService('themeService', () => import('../../../src/server/services/xhs/themeService'));
}

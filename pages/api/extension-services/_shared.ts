import { getService } from '../_init';

export async function getExtensionService() {
  return getService('extensionService', () => import('../../../src/server/services/extensionService'));
}

import { getService } from '../_init';

export async function getCreativeService() {
  return getService('creativeService', () => import('../../../src/server/services/xhs/creativeService'));
}

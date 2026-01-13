import { getService } from '../_init';

export async function getCaptureService() {
  return getService('captureService', () => import('../../../src/server/services/xhs/capture'));
}

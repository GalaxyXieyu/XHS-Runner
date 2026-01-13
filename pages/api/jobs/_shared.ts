import { ensureInit, getService } from '../_init';

export { ensureInit };

export async function getSchedulerModule() {
  return getService('schedulerModule', () => import('../../../src/server/services/scheduler'));
}

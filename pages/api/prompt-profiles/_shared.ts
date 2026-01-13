import { getService } from '../_init';

export async function getPromptProfileService() {
  return getService('promptProfileService', () => import('../../../src/server/services/xhs/promptProfileService'));
}

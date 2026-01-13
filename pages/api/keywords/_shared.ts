import { getService } from '../_init';

export async function getKeywordService() {
  return getService('keywordService', () => import('../../../src/server/services/xhs/keywords'));
}

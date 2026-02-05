/**
 * 评论同步定时任务
 * 建议频率：每小时执行一次
 */

import { syncCommentsForPublishedNotes } from '../../xhs/operations/commentSyncService';

export interface CommentSyncJobResult {
  success: boolean;
  synced: number;
  errors: string[];
  duration_ms: number;
}

/**
 * 执行评论同步任务
 */
export async function executeCommentSyncJob(): Promise<CommentSyncJobResult> {
  const startTime = Date.now();

  try {
    const result = await syncCommentsForPublishedNotes();

    return {
      success: result.errors.length === 0,
      synced: result.synced,
      errors: result.errors,
      duration_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      synced: 0,
      errors: [error.message || String(error)],
      duration_ms: Date.now() - startTime,
    };
  }
}

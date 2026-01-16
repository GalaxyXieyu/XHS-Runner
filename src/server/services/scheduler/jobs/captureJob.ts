// 抓取任务处理器 - 封装现有的抓取逻辑

import { ScheduledJob, ExecutionResult, CaptureJobParams } from '../types';
import { ExecutionContext } from '../jobExecutor';

export async function handleCaptureJob(
  job: ScheduledJob,
  params: CaptureJobParams,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const limit = params.limit || 50;

  try {
    // 动态导入抓取服务
    const { runCapture, RateLimitError } = await import('../../xhs/capture/capture');

    if (job.job_type === 'capture_keyword' && job.keyword_id) {
      // 按关键词抓取
      const result = await runCapture(job.keyword_id, limit);
      return {
        success: true,
        total: result.total,
        inserted: result.inserted,
        duration_ms: 0,
      };
    }

    if (job.job_type === 'capture_theme' && job.theme_id) {
      // 按主题抓取所有关键词
      const { getDatabase } = await import('../../../db');
      const db = getDatabase();

      const { data, error } = await db
        .from('keywords')
        .select('id')
        .eq('theme_id', job.theme_id)
        .eq('is_enabled', 1);
      if (error) throw error;
      const keywords: { id: number }[] = (data || []) as any;

      let totalCount = 0;
      let insertedCount = 0;

      for (const kw of keywords) {
        if (context.abortController.signal.aborted) {
          throw new Error('任务已取消');
        }

        try {
          const result = await runCapture(kw.id, limit);
          totalCount += result.total;
          insertedCount += result.inserted;
        } catch (e: any) {
          // 检测到限流，暂停调度器并停止当前任务
          if (e instanceof RateLimitError || e.name === 'RateLimitError') {
            console.error('[captureJob] Rate limit detected, pausing scheduler for 30 minutes...');
            const { getScheduler } = await import('../scheduler');
            getScheduler().pause();
            // 30分钟后自动恢复
            setTimeout(() => {
              console.log('[captureJob] Resuming scheduler after rate limit cooldown');
              getScheduler().resume();
            }, 30 * 60 * 1000);
            return {
              success: false,
              error: '小红书安全限制，调度器已暂停30分钟',
              duration_ms: 0,
            };
          }
          throw e;
        }

        // 关键词之间添加延迟
        await new Promise(r => setTimeout(r, 1000));
      }

      return {
        success: true,
        total: totalCount,
        inserted: insertedCount,
        duration_ms: 0,
      };
    }

    return { success: false, error: '无效的任务配置', duration_ms: 0 };
  } catch (error: any) {
    // 顶层也检测限流错误
    if (error.name === 'RateLimitError') {
      console.error('[captureJob] Rate limit detected at top level, pausing scheduler...');
      const { getScheduler } = await import('../scheduler');
      getScheduler().pause();
      setTimeout(() => {
        console.log('[captureJob] Resuming scheduler after rate limit cooldown');
        getScheduler().resume();
      }, 30 * 60 * 1000);
      return {
        success: false,
        error: '小红书安全限制，调度器已暂停30分钟',
        duration_ms: 0,
      };
    }
    return {
      success: false,
      error: error.message || String(error),
      duration_ms: 0,
    };
  }
}

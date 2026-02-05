/**
 * 指标采集定时任务
 * 建议频率：每6小时执行一次
 */

import { captureMetricsForPublishedNotes } from '../../xhs/operations/metricsCaptureService';

export interface MetricsCaptureJobResult {
  success: boolean;
  captured: number;
  errors: string[];
  duration_ms: number;
}

/**
 * 执行指标采集任务
 */
export async function executeMetricsCaptureJob(): Promise<MetricsCaptureJobResult> {
  const startTime = Date.now();

  try {
    const result = await captureMetricsForPublishedNotes();

    return {
      success: result.errors.length === 0,
      captured: result.captured,
      errors: result.errors,
      duration_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      captured: 0,
      errors: [error.message || String(error)],
      duration_ms: Date.now() - startTime,
    };
  }
}

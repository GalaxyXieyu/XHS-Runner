import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../db';
import { resolveUserDataPath } from '../../runtime/userDataPath';

export async function recordMetric({
  publishRecordId,
  metricKey,
  metricValue,
  capturedAt,
}: {
  publishRecordId?: number;
  metricKey: string;
  metricValue: number;
  capturedAt?: string;
}) {
  const db = getDatabase();
  const timestamp = capturedAt || new Date().toISOString();
  const { error } = await db
    .from('metrics')
    .insert({
      publish_record_id: publishRecordId || null,
      metric_key: metricKey,
      metric_value: metricValue,
      captured_at: timestamp,
    });
  if (error) throw error;
  return { metricKey, metricValue, capturedAt: timestamp };
}

export async function getMetricsSummary(windowDays = 7) {
  const db = getDatabase();
  const now = Date.now();
  const windowStartIso = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const previousStartIso = new Date(now - windowDays * 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: windowRows, error: windowError } = await db
    .from('metrics')
    .select('metric_key, metric_value, captured_at')
    .gte('captured_at', windowStartIso);
  if (windowError) throw windowError;

  const { data: previousRows, error: prevError } = await db
    .from('metrics')
    .select('metric_key, metric_value, captured_at')
    .gte('captured_at', previousStartIso)
    .lt('captured_at', windowStartIso);
  if (prevError) throw prevError;

  const totalsMap = new Map<string, number>();
  (windowRows || []).forEach((row: any) => {
    const key = String(row.metric_key);
    totalsMap.set(key, (totalsMap.get(key) || 0) + Number(row.metric_value || 0));
  });

  const previousMap = new Map<string, number>();
  (previousRows || []).forEach((row: any) => {
    const key = String(row.metric_key);
    previousMap.set(key, (previousMap.get(key) || 0) + Number(row.metric_value || 0));
  });

  const totals = Array.from(totalsMap.entries()).map(([metricKey, total]) => ({
    metricKey,
    total: Number(total.toFixed(2)),
  }));

  const comparison = totals.map((row) => {
    const prevValue = previousMap.get(row.metricKey) || 0;
    return {
      metricKey: row.metricKey,
      current: row.total,
      previous: Number(prevValue.toFixed(2)),
      delta: Number((row.total - prevValue).toFixed(2)),
    };
  });

  const trend = (windowRows || []).reduce((acc: Record<string, Array<{ day: string; total: number }>>, row: any) => {
    const metricKey = String(row.metric_key);
    const day = String(row.captured_at || '').slice(0, 10);
    if (!acc[metricKey]) acc[metricKey] = [];
    acc[metricKey].push({ day, total: Number(row.metric_value || 0) });
    return acc;
  }, {});

  Object.keys(trend).forEach((key) => {
    const dayTotals = new Map<string, number>();
    trend[key].forEach((item) => dayTotals.set(item.day, (dayTotals.get(item.day) || 0) + item.total));
    trend[key] = Array.from(dayTotals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, total]) => ({ day, total: Number(total.toFixed(2)) }));
  });

  return { windowDays, totals, comparison, trend };
}

export async function exportMetricsCsv(windowDays = 7) {
  const db = getDatabase();
  const windowStartIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('metrics')
    .select('publish_record_id, metric_key, metric_value, captured_at')
    .gte('captured_at', windowStartIso)
    .order('captured_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];

  const header = ['publish_record_id', 'metric_key', 'metric_value', 'captured_at'];
  const lines = [header.join(',')];
  rows.forEach((row: any) => {
    lines.push([row.publish_record_id, row.metric_key, row.metric_value, row.captured_at].join(','));
  });

  const exportDir = resolveUserDataPath('exports');
  fs.mkdirSync(exportDir, { recursive: true });
  const filename = `metrics-${Date.now()}.csv`;
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return { path: filePath, count: rows.length };
}

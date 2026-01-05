const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDatabase } = require('./db');

function recordMetric({ publishRecordId, metricKey, metricValue, capturedAt }) {
  const db = getDatabase();
  const timestamp = capturedAt || new Date().toISOString();
  db.prepare(
    `INSERT INTO metrics (publish_record_id, metric_key, metric_value, captured_at)
     VALUES (?, ?, ?, ?)`
  ).run(publishRecordId || null, metricKey, metricValue, timestamp);
  return { metricKey, metricValue, capturedAt: timestamp };
}

function getMetricsSummary(windowDays = 7) {
  const db = getDatabase();
  const windowClause = `-${windowDays} days`;
  const previousClause = `-${windowDays * 2} days`;

  const totals = db
    .prepare(
      `SELECT metric_key AS metricKey, ROUND(SUM(metric_value), 2) AS total
       FROM metrics
       WHERE captured_at >= datetime('now', ?)
       GROUP BY metric_key`
    )
    .all(windowClause);

  const previousTotals = db
    .prepare(
      `SELECT metric_key AS metricKey, ROUND(SUM(metric_value), 2) AS total
       FROM metrics
       WHERE captured_at >= datetime('now', ?)
         AND captured_at < datetime('now', ?)
       GROUP BY metric_key`
    )
    .all(previousClause, windowClause);

  const comparison = totals.map((row) => {
    const previous = previousTotals.find((item) => item.metricKey === row.metricKey);
    const prevValue = previous ? previous.total : 0;
    return {
      metricKey: row.metricKey,
      current: row.total,
      previous: prevValue,
      delta: Number((row.total - prevValue).toFixed(2)),
    };
  });

  const trendRows = db
    .prepare(
      `SELECT date(captured_at) AS day, metric_key AS metricKey, ROUND(SUM(metric_value), 2) AS total
       FROM metrics
       WHERE captured_at >= datetime('now', ?)
       GROUP BY day, metric_key
       ORDER BY day ASC`
    )
    .all(windowClause);

  const trend = trendRows.reduce((acc, row) => {
    if (!acc[row.metricKey]) {
      acc[row.metricKey] = [];
    }
    acc[row.metricKey].push({ day: row.day, total: row.total });
    return acc;
  }, {});

  return {
    windowDays,
    totals,
    comparison,
    trend,
  };
}

function exportMetricsCsv(windowDays = 7) {
  const db = getDatabase();
  const windowClause = `-${windowDays} days`;
  const rows = db
    .prepare(
      `SELECT publish_record_id, metric_key, metric_value, captured_at
       FROM metrics
       WHERE captured_at >= datetime('now', ?)
       ORDER BY captured_at DESC`
    )
    .all(windowClause);

  const header = ['publish_record_id', 'metric_key', 'metric_value', 'captured_at'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push([row.publish_record_id, row.metric_key, row.metric_value, row.captured_at].join(','));
  });

  const exportDir = path.join(app.getPath('userData'), 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  const filename = `metrics-${Date.now()}.csv`;
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return { path: filePath, count: rows.length };
}

module.exports = {
  exportMetricsCsv,
  getMetricsSummary,
  recordMetric,
};

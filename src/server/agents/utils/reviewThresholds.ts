export interface ReviewThresholds {
  infoDensity: number;
  textImageAlignment: number;
  styleConsistency: number;
  readability: number;
  platformFit: number;
  overall: number;
}

const DEFAULT_BASE_THRESHOLD = 0.6;

function normalizeThreshold(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;

  // 兼容 60 或 0.6 两种输入
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function getBaseThreshold(): number {
  return normalizeThreshold(process.env.REVIEW_THRESHOLD_BASE, DEFAULT_BASE_THRESHOLD);
}

function buildReviewThresholds(): ReviewThresholds {
  const base = getBaseThreshold();

  return {
    infoDensity: normalizeThreshold(process.env.REVIEW_THRESHOLD_INFO_DENSITY, base),
    textImageAlignment: normalizeThreshold(process.env.REVIEW_THRESHOLD_TEXT_IMAGE_ALIGNMENT, base),
    styleConsistency: normalizeThreshold(process.env.REVIEW_THRESHOLD_STYLE_CONSISTENCY, base),
    readability: normalizeThreshold(process.env.REVIEW_THRESHOLD_READABILITY, base),
    platformFit: normalizeThreshold(process.env.REVIEW_THRESHOLD_PLATFORM_FIT, base),
    overall: normalizeThreshold(process.env.REVIEW_THRESHOLD_OVERALL, base),
  };
}

export const REVIEW_THRESHOLDS = buildReviewThresholds();

function formatThreshold(threshold: number): string {
  return threshold.toFixed(2);
}

export function buildReviewThresholdHint(thresholds: ReviewThresholds = REVIEW_THRESHOLDS): string {
  return [
    '当前系统审核阈值（0-1）：',
    `- infoDensity >= ${formatThreshold(thresholds.infoDensity)}`,
    `- textImageAlignment >= ${formatThreshold(thresholds.textImageAlignment)}`,
    `- styleConsistency >= ${formatThreshold(thresholds.styleConsistency)}`,
    `- readability >= ${formatThreshold(thresholds.readability)}`,
    `- platformFit >= ${formatThreshold(thresholds.platformFit)}`,
    `- overall >= ${formatThreshold(thresholds.overall)}`,
    '请严格按以上阈值判断 approved。',
  ].join("\n");
}

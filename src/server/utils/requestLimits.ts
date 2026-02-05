export function parseNumberParam(
  value: string | string[] | undefined,
  options: { min: number; max: number; defaultValue: number }
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  if (!Number.isFinite(num)) return options.defaultValue;
  if (num < options.min) return options.min;
  if (num > options.max) return options.max;
  return num;
}

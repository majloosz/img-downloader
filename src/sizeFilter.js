export const MIN_SIZE_KB_MIN = 0;
export const MIN_SIZE_KB_MAX = 512;
export const DEFAULT_MIN_SIZE_KB = 5;

export function parseMinimumSizeKb(raw, fallback = DEFAULT_MIN_SIZE_KB) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampMinimumSizeKb(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MIN_SIZE_KB;
  return Math.min(MIN_SIZE_KB_MAX, Math.max(MIN_SIZE_KB_MIN, parsed));
}

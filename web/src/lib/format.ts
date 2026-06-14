/**
 * Presentation-only number formatters for the analysis UI. Pure and
 * locale-pinned ('en-US') so server and client render identically (no hydration
 * mismatch). i18n is a deferred follow-up; when it lands these gain a locale arg.
 */

const num = (n: number, opts: Intl.NumberFormatOptions) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', opts) : '—';

/** Planner cost — grouped, up to 2 decimals (costs are unitless floats). */
export function formatCost(n: number): string {
  return num(n, { maximumFractionDigits: 2 });
}

/** A row count — grouped integer. */
export function formatRows(n: number): string {
  return num(Math.round(n), { maximumFractionDigits: 0 });
}

/** A duration in milliseconds, e.g. "12.34 ms". */
export function formatMs(n: number): string {
  return Number.isFinite(n)
    ? `${num(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ms`
    : '—';
}

/**
 * Estimate-vs-actual ratio as a readable "Nx" multiplier (always ≥ 1), the
 * signal behind the `rows_misestimated` flag. Returns "—" when either input is
 * non-finite or ≤ 0 (no meaningful ratio).
 */
export function formatEstimateRatio(estimatedRows: number, actualRows: number): string {
  if (!Number.isFinite(estimatedRows) || !Number.isFinite(actualRows)) return '—';
  if (estimatedRows <= 0 || actualRows <= 0) return '—';
  const ratio = Math.max(estimatedRows / actualRows, actualRows / estimatedRows);
  return `${num(ratio, { maximumFractionDigits: 1 })}×`;
}

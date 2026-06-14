import type { AnalyzeResult } from './analyze-result';

/** Modes whose total cost falls within this fraction of the max read as "the
 *  distribution didn't move the plan" rather than a meaningful comparison. */
export const FLAT_COST_THRESHOLD = 0.01;

/**
 * Cross-mode signals the UI surfaces so an uninformative run reads as such
 * rather than looking broken: a query that matched no rows, or modes whose
 * costs are effectively identical (common at small scale or for trivial plans).
 */
export function summarizeRun(result: AnalyzeResult): {
  allZeroRows: boolean;
  flatCost: boolean;
} {
  const costs = result.modes.map((m) => m.metrics.rootTotalCost);
  const max = costs.length ? Math.max(...costs) : 0;
  const min = costs.length ? Math.min(...costs) : 0;

  return {
    allZeroRows: result.modes.length > 0 && result.modes.every((m) => m.metrics.actualRows === 0),
    flatCost: result.modes.length > 1 && max > 0 && (max - min) / max < FLAT_COST_THRESHOLD,
  };
}

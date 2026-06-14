import { describe, it, expect } from 'vitest';
import type { AnalyzeResult, ModeResult } from './analyze-result';
import { summarizeRun } from './analysis-summary';

function mode(cost: number, actualRows: number): ModeResult {
  return {
    mode: 'append_order',
    rowCounts: {},
    plan: [],
    metrics: {
      planningTimeMs: 0,
      executionTimeMs: 0,
      rootStartupCost: 0,
      rootTotalCost: cost,
      estimatedRows: 0,
      actualRows,
    },
    flags: [],
  };
}

function result(modes: ModeResult[]): AnalyzeResult {
  return { runId: 'r', query: 'q', schemaSnapshot: [], worstMode: 'append_order', modes };
}

describe('summarizeRun', () => {
  it('flags a run where every mode returned zero rows', () => {
    const s = summarizeRun(result([mode(10, 0), mode(20, 0)]));
    expect(s.allZeroRows).toBe(true);
  });

  it('does not flag zero rows when any mode returned rows', () => {
    expect(summarizeRun(result([mode(10, 0), mode(20, 5)])).allZeroRows).toBe(false);
  });

  it('flags flat cost when modes are within 1%', () => {
    const s = summarizeRun(result([mode(238.08, 5), mode(238.09, 5)]));
    expect(s.flatCost).toBe(true);
  });

  it('does not flag flat cost when modes diverge', () => {
    expect(summarizeRun(result([mode(340, 5), mode(839, 5)])).flatCost).toBe(false);
  });

  it('never flags flat cost for a single mode', () => {
    expect(summarizeRun(result([mode(10, 5)])).flatCost).toBe(false);
  });
});

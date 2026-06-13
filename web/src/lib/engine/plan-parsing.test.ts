import { describe, it, expect } from 'vitest';
import { detectFlags, metricsFromPlan } from './run';

const wrap = (plan: object) => [{ Plan: plan, 'Planning Time': 1, 'Execution Time': 2 }];

describe('metricsFromPlan', () => {
  it('extracts the root metrics from a plan', () => {
    const m = metricsFromPlan(
      wrap({ 'Total Cost': 50, 'Startup Cost': 5, 'Plan Rows': 10, 'Actual Rows': 8 }),
    );
    expect(m).toEqual({
      planningTimeMs: 1,
      executionTimeMs: 2,
      rootStartupCost: 5,
      rootTotalCost: 50,
      estimatedRows: 10,
      actualRows: 8,
    });
  });

  it('throws on a malformed plan rather than fabricating zeros', () => {
    expect(() => metricsFromPlan([])).toThrow(/unexpected plan shape/i);
    expect(() => metricsFromPlan([{ Plan: {} }])).toThrow(/unexpected plan shape/i);
    expect(() => metricsFromPlan(undefined)).toThrow(/unexpected plan shape/i);
  });
});

describe('detectFlags', () => {
  it('flags a sequential scan', () => {
    const flags = detectFlags(
      wrap({ 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Actual Rows': 100 }),
    );
    expect(flags).toContainEqual({
      code: 'seq_scan',
      detail: { relation: 'orders', actualRows: 100 },
    });
  });

  it('flags a sort that spilled to disk', () => {
    const flags = detectFlags(
      wrap({ 'Node Type': 'Sort', 'Sort Method': 'external merge Disk: 2048kB' }),
    );
    expect(flags.map((f) => f.code)).toContain('sort_spilled_to_disk');
  });

  it('flags row misestimation at the 10x boundary but not below', () => {
    const at = detectFlags(wrap({ 'Node Type': 'Index Scan', 'Plan Rows': 1, 'Actual Rows': 10 }));
    expect(at.map((f) => f.code)).toContain('rows_misestimated');

    const below = detectFlags(
      wrap({ 'Node Type': 'Index Scan', 'Plan Rows': 1, 'Actual Rows': 9 }),
    );
    expect(below.map((f) => f.code)).not.toContain('rows_misestimated');
  });

  it('recurses into child plan nodes', () => {
    const flags = detectFlags(
      wrap({
        'Node Type': 'Nested Loop',
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Actual Rows': 5 }],
      }),
    );
    expect(flags.map((f) => f.code)).toContain('seq_scan');
  });

  it('returns no flags when the plan root is missing', () => {
    expect(detectFlags(undefined)).toEqual([]);
    expect(detectFlags([{}])).toEqual([]);
  });
});

import { describe, expect, test } from 'vitest';
import type { AnalyzeResult } from '@/lib/analyze/analyze-result';
import { buildRecommendationPrompt } from './recommendation-prompt';

/**
 * A two-mode run where the worst mode's plan carries a unique marker string and
 * the non-worst mode's plan carries a different one — so a test can assert the
 * builder includes the worst plan verbatim while omitting the other.
 */
function fixture(): AnalyzeResult {
  return {
    runId: 'run_123',
    query: 'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at',
    schemaSnapshot: [
      {
        table: 'orders',
        columns: [
          { name: 'id', pgType: 'bigint', nullable: false },
          { name: 'customer_id', pgType: 'bigint', nullable: false },
          { name: 'created_at', pgType: 'timestamptz', nullable: false },
        ],
        primaryKey: ['id'],
        foreignKeys: [{ columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] }],
        uniques: [],
        indexes: [{ name: 'orders_pkey', columns: ['id'], unique: true }],
      },
    ],
    worstMode: 'shuffled',
    modes: [
      {
        mode: 'append_order',
        rowCounts: { orders: 5000 },
        plan: [{ Plan: { 'Node Type': 'Index Scan', NONWORST_PLAN_MARKER: true } }],
        metrics: {
          planningTimeMs: 0.3,
          executionTimeMs: 4.2,
          rootStartupCost: 0,
          rootTotalCost: 120.5,
          estimatedRows: 50,
          actualRows: 50,
        },
        flags: [{ code: 'append_clean_flag' }],
      },
      {
        mode: 'shuffled',
        rowCounts: { orders: 5000 },
        plan: [{ Plan: { 'Node Type': 'Seq Scan', WORST_PLAN_MARKER: true } }],
        metrics: {
          planningTimeMs: 0.4,
          executionTimeMs: 88.7,
          rootStartupCost: 0,
          rootTotalCost: 940.25,
          estimatedRows: 50,
          actualRows: 4800,
        },
        flags: [{ code: 'seq_scan' }, { code: 'rows_misestimated', detail: { ratio: 96 } }],
      },
    ],
  };
}

describe('buildRecommendationPrompt', () => {
  test('includes the query verbatim', () => {
    const { prompt } = buildRecommendationPrompt(fixture());
    expect(prompt).toContain('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at');
  });

  test('names the worst mode', () => {
    const { prompt } = buildRecommendationPrompt(fixture());
    expect(prompt).toContain('shuffled');
  });

  test('includes the schema (table, column, and index names)', () => {
    const { prompt } = buildRecommendationPrompt(fixture());
    expect(prompt).toContain('orders');
    expect(prompt).toContain('customer_id');
    expect(prompt).toContain('orders_pkey');
  });

  test('includes every mode’s metrics and flags', () => {
    const { prompt } = buildRecommendationPrompt(fixture());
    // worst-mode metric + flags
    expect(prompt).toContain('940.25');
    expect(prompt).toContain('seq_scan');
    expect(prompt).toContain('rows_misestimated');
    // the non-worst mode contributes its metrics + flags for comparison
    expect(prompt).toContain('120.5');
    expect(prompt).toContain('append_clean_flag');
  });

  test('includes the worst-mode plan verbatim but omits other modes’ plans', () => {
    const { prompt } = buildRecommendationPrompt(fixture());
    expect(prompt).toContain('WORST_PLAN_MARKER');
    expect(prompt).not.toContain('NONWORST_PLAN_MARKER');
  });

  test('omits the plan section gracefully when the worst mode is absent from modes[]', () => {
    // Defensive branch: worstMode always comes from pickWorstMode over the same
    // modes, so it is present in practice — but if a drifted/partial run names a
    // worst mode not in modes[], the builder must not emit a dangling/empty plan.
    const result = { ...fixture(), worstMode: 'high_skew' as const };
    const { prompt } = buildRecommendationPrompt(result);
    expect(prompt).toContain('high_skew'); // still named as the worst mode
    expect(prompt).toContain('append_clean_flag'); // per-mode findings still present
    expect(prompt).not.toContain('Verbatim EXPLAIN'); // no empty plan section
    expect(prompt).not.toContain('WORST_PLAN_MARKER');
  });

  test('system prompt forbids inventing metrics and frames advice as re-verifiable hypotheses', () => {
    const { system } = buildRecommendationPrompt(fixture());
    expect(system.toLowerCase()).toContain('ground truth');
    expect(system.toLowerCase()).toContain('hypothes');
  });

  test('system prompt targets PostgreSQL 17 and grounds advice in the official docs', () => {
    const { system } = buildRecommendationPrompt(fixture());
    // Pin the target version (plan shape is version-specific) and steer the
    // model to cite primary-source PG17 docs rather than its own recollection.
    expect(system).toContain('PostgreSQL 17');
    expect(system).toContain('https://www.postgresql.org/docs/17/');
  });
});

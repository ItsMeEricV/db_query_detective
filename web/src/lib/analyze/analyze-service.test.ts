import { describe, it, expect } from 'vitest';
import { upsertDdl } from '@/lib/ddl/ddl-service';
import type { ModeName } from '@/lib/engine/modes';
import {
  runAnalysis,
  getAnalysisRun,
  AnalyzeValidationError,
  pickWorstMode,
} from './analyze-service';
import type { ModeResult } from './analyze-result';

const seedSchema = async (sessionId: string) => {
  await upsertDdl({
    sessionId,
    tableName: 'users',
    sql: 'CREATE TABLE users (id bigint PRIMARY KEY, name text)',
  });
  await upsertDdl({
    sessionId,
    tableName: 'orders',
    sql: 'CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users (id), created_at timestamptz, status text)',
  });
};

describe('runAnalysis', () => {
  it('analyzes a join query across applicable modes and persists the run', async () => {
    const sessionId = crypto.randomUUID();
    await seedSchema(sessionId);

    const result = await runAnalysis(
      {
        sessionId,
        query:
          "SELECT o.id FROM orders o JOIN users u ON o.user_id = u.id WHERE o.created_at > '2026-01-01' ORDER BY o.created_at",
      },
      { scale: 200 },
    );

    expect(result.runId).toBeTruthy();
    expect(result.modes.length).toBeGreaterThan(0);
    expect(result.modes.map((m) => m.mode)).toContain(result.worstMode);
    expect(result.modes.every((m) => m.metrics.rootTotalCost > 0)).toBe(true);
    expect(result.schemaSnapshot.map((t) => t.table).sort()).toEqual(['orders', 'users']);

    const reread = await getAnalysisRun(result.runId);
    expect(reread?.worstMode).toBe(result.worstMode);
    expect(reread?.modes.length).toBe(result.modes.length);
  });

  it('rejects a query against a table with no DDL in the session', async () => {
    await expect(
      runAnalysis(
        { sessionId: crypto.randomUUID(), query: 'SELECT * FROM nonexistent' },
        { scale: 50 },
      ),
    ).rejects.toBeInstanceOf(AnalyzeValidationError);
  });

  it('rejects a non-SELECT statement', async () => {
    const sessionId = crypto.randomUUID();
    await seedSchema(sessionId);
    await expect(
      runAnalysis({ sessionId, query: 'DROP TABLE users' }, { scale: 50 }),
    ).rejects.toBeInstanceOf(AnalyzeValidationError);
  });

  it('seeds rows matching an equality predicate (no degenerate 0-row plan)', async () => {
    const sessionId = crypto.randomUUID();
    await seedSchema(sessionId);

    const result = await runAnalysis(
      { sessionId, query: "SELECT id FROM orders WHERE status = 'paid'" },
      { scale: 400 },
    );

    expect(result.modes.some((m) => m.metrics.actualRows > 0)).toBe(true);
  });

  it('rejects a query referencing a column the table does not have', async () => {
    const sessionId = crypto.randomUUID();
    await seedSchema(sessionId);
    await expect(
      runAnalysis({ sessionId, query: 'SELECT no_such_column FROM orders' }, { scale: 50 }),
    ).rejects.toBeInstanceOf(AnalyzeValidationError);
  });
});

describe('pickWorstMode', () => {
  const result = (mode: ModeName, rootTotalCost: number, executionTimeMs: number): ModeResult => ({
    mode,
    rowCounts: {},
    plan: [],
    metrics: {
      planningTimeMs: 0,
      executionTimeMs,
      rootStartupCost: 0,
      rootTotalCost,
      estimatedRows: 0,
      actualRows: 0,
    },
    flags: [],
  });

  it('picks the highest Total Cost', () => {
    expect(
      pickWorstMode([
        result('append_order', 100, 1),
        result('shuffled', 200, 1),
        result('high_skew', 150, 1),
      ]),
    ).toBe('shuffled');
  });

  it('breaks cost ties by Execution Time', () => {
    expect(pickWorstMode([result('append_order', 200, 5), result('shuffled', 200, 9)])).toBe(
      'shuffled',
    );
  });

  it('keeps the first mode on a full tie', () => {
    expect(pickWorstMode([result('append_order', 200, 5), result('shuffled', 200, 5)])).toBe(
      'append_order',
    );
  });
});

import { describe, it, expect, vi } from 'vitest';
import { parseTableDdl } from '@/lib/ddl/parse-ddl';
import { parseQuery } from '@/lib/analyze/parse-query';
import { deriveSeedPlan } from '@/lib/analyze/seed-plan';
import { applicableModes } from '@/lib/analyze/applicable-modes';
import { PgDb } from './pg-db';
import { runModes, QueryExecutionError } from './run';

// Integration: builds a throwaway schema in the local dockerized Postgres,
// seeds it, and runs EXPLAIN ANALYZE per mode.
const USERS_SQL = 'CREATE TABLE users (id bigint PRIMARY KEY, name text)';
const ORDERS_SQL =
  'CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users (id), created_at timestamptz, status text)';

describe('runModes', () => {
  it('runs each applicable mode and captures a plan + metrics', async () => {
    const users = await parseTableDdl(USERS_SQL);
    const orders = await parseTableDdl(ORDERS_SQL);
    const query =
      "SELECT o.id FROM orders o JOIN users u ON o.user_id = u.id WHERE o.created_at > '2026-01-01' ORDER BY o.created_at";
    const shape = await parseQuery(query);
    const seedPlan = deriveSeedPlan([orders, users], shape, { scale: 200 });
    const modes = applicableModes(shape);

    const results = await runModes({
      createTableSql: new Map([
        ['users', USERS_SQL],
        ['orders', ORDERS_SQL],
      ]),
      seedPlan,
      query,
      modes,
      seed: 42,
    });

    expect(results.map((r) => r.mode)).toEqual(modes);
    for (const r of results) {
      expect(r.rowCounts.orders).toBe(200);
      expect(r.rowCounts.users).toBeGreaterThan(0);
      expect(Array.isArray(r.plan)).toBe(true);
      expect(r.metrics.rootTotalCost).toBeGreaterThan(0);
      expect(r.metrics.executionTimeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic — same inputs yield the same plan costs', async () => {
    const orders = await parseTableDdl(ORDERS_SQL);
    const users = await parseTableDdl(USERS_SQL);
    const query = 'SELECT * FROM orders ORDER BY created_at';
    const shape = await parseQuery(query);
    const seedPlan = deriveSeedPlan([orders, users], shape, { scale: 200 });
    const run = () =>
      runModes({
        createTableSql: new Map([
          ['users', USERS_SQL],
          ['orders', ORDERS_SQL],
        ]),
        seedPlan,
        query,
        modes: ['append_order'],
        seed: 99,
      });

    const [a, b] = await Promise.all([run(), run()]);
    expect(a[0].metrics.rootTotalCost).toBe(b[0].metrics.rootTotalCost);
  });

  it('drops the throwaway schema even when the query fails', async () => {
    const sql = 'CREATE TABLE widgets (id bigint PRIMARY KEY, created_at timestamptz)';
    const widgets = await parseTableDdl(sql);
    const seedPlan = deriveSeedPlan([widgets], await parseQuery('SELECT * FROM widgets'), {
      scale: 50,
    });
    // Spy through the real method (storage boundary) to confirm cleanup runs.
    const dropSpy = vi.spyOn(PgDb.prototype, 'dropSchema');

    await expect(
      runModes({
        createTableSql: new Map([['widgets', sql]]),
        seedPlan,
        query: 'SELECT no_such_col FROM widgets',
        modes: ['append_order'],
        seed: 1,
      }),
    ).rejects.toBeInstanceOf(QueryExecutionError);

    expect(dropSpy).toHaveBeenCalledTimes(1);
    dropSpy.mockRestore();
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { parseTableDdl } from '@/lib/ddl/parse-ddl';
import type { ParsedTable } from '@/lib/ddl/parsed-table';
import { parseQuery } from './parse-query';
import { deriveSeedPlan } from './seed-plan';

let users: ParsedTable;
let orders: ParsedTable;

beforeAll(async () => {
  users = await parseTableDdl('CREATE TABLE users (id bigint PRIMARY KEY, name text)');
  orders = await parseTableDdl(
    'CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users (id), created_at timestamptz, status text)',
  );
});

describe('deriveSeedPlan', () => {
  it('orders parents before children (FK-topological)', async () => {
    const shape = await parseQuery('SELECT * FROM orders o JOIN users u ON o.user_id = u.id');
    const plan = deriveSeedPlan([orders, users], shape, { scale: 1000 });
    expect(plan.tables.map((t) => t.table)).toEqual(['users', 'orders']);
  });

  it('scales parents smaller than children', async () => {
    const shape = await parseQuery('SELECT * FROM orders o JOIN users u ON o.user_id = u.id');
    const plan = deriveSeedPlan([orders, users], shape, { scale: 1000 });
    const rows = Object.fromEntries(plan.tables.map((t) => [t.table, t.rowCount]));
    expect(rows.orders).toBe(1000);
    expect(rows.users).toBeLessThan(1000);
  });

  it('gives the PK full cardinality and the FK the parent row count', async () => {
    const shape = await parseQuery('SELECT * FROM orders o JOIN users u ON o.user_id = u.id');
    const plan = deriveSeedPlan([orders, users], shape, { scale: 1000 });
    const ordersPlan = plan.tables.find((t) => t.table === 'orders')!;
    const usersPlan = plan.tables.find((t) => t.table === 'users')!;

    const id = ordersPlan.columns.find((c) => c.name === 'id')!;
    expect(id.cardinality).toBe(1000); // PK unique

    const fk = ordersPlan.columns.find((c) => c.name === 'user_id')!;
    expect(fk.fk).toEqual({ refTable: 'users', refColumn: 'id' });
    expect(fk.role).toBe('fanOutFk');
    expect(fk.cardinality).toBe(usersPlan.rowCount); // pool = parent keys
  });

  it('tags the ordered axis from ORDER BY and types the range literal', async () => {
    const shape = await parseQuery(
      "SELECT * FROM orders WHERE created_at > '2026-01-01' ORDER BY created_at",
    );
    const plan = deriveSeedPlan([orders], shape, { scale: 500 });
    const ordersPlan = plan.tables[0];

    const createdAt = ordersPlan.columns.find((c) => c.name === 'created_at')!;
    expect(createdAt.role).toBe('ordered');
    expect(ordersPlan.ctx.rangeLiteral).toBeInstanceOf(Date);
  });

  it('tags a value column referenced by an equality filter as skewValue', async () => {
    const shape = await parseQuery("SELECT * FROM orders WHERE status = 'paid'");
    const plan = deriveSeedPlan([orders], shape, { scale: 500 });
    const status = plan.tables[0].columns.find((c) => c.name === 'status')!;
    expect(status.role).toBe('skewValue');
  });

  it('injects an equality-filter literal into the column so it can match', async () => {
    const shape = await parseQuery("SELECT * FROM orders WHERE status = 'paid'");
    const plan = deriveSeedPlan([orders], shape, { scale: 500 });
    const status = plan.tables[0].columns.find((c) => c.name === 'status')!;
    expect(status.injectValues).toEqual(['paid']);
  });

  it('falls back to the primary key as the ordered axis when the query has none', async () => {
    const shape = await parseQuery('SELECT * FROM users');
    const plan = deriveSeedPlan([users], shape, { scale: 100 });
    const id = plan.tables[0].columns.find((c) => c.name === 'id')!;
    expect(id.role).toBe('ordered');
  });
});

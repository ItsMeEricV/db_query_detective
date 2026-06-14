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
    expect(fk.kind).toEqual({ tag: 'fk', refTable: 'users', refColumn: 'id' });
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

  it('captures a range literal for a filtered value column that is not the ordered axis', async () => {
    const files = await parseTableDdl(
      'CREATE TABLE files (id bigint PRIMARY KEY, size_bytes bigint, created_at timestamptz)',
    );
    // ORDER BY created_at makes created_at the ordered axis; size_bytes is only
    // range-filtered, and used to be ignored by the seeder.
    const shape = await parseQuery(
      'SELECT * FROM files WHERE size_bytes > 500000 ORDER BY created_at',
    );
    const plan = deriveSeedPlan([files], shape, { scale: 500 });
    const cols = plan.tables[0].columns;
    const sizeBytes = cols.find((c) => c.name === 'size_bytes')!;
    const createdAt = cols.find((c) => c.name === 'created_at')!;

    expect(sizeBytes.role).toBeUndefined(); // not the ordered axis
    expect(sizeBytes.rangeLiteral).toBe(500000);
    expect(createdAt.role).toBe('ordered');
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
    expect(status.kind).toEqual({ tag: 'value', injectValues: ['paid'] });
  });

  it('falls back to the primary key as the ordered axis when the query has none', async () => {
    const shape = await parseQuery('SELECT * FROM users');
    const plan = deriveSeedPlan([users], shape, { scale: 100 });
    const id = plan.tables[0].columns.find((c) => c.name === 'id')!;
    expect(id.role).toBe('ordered');
  });

  it('treats a composite primary key as having no single-column PK', async () => {
    const t = await parseTableDdl('CREATE TABLE t (a bigint, b bigint, PRIMARY KEY (a, b))');
    const plan = deriveSeedPlan([t], await parseQuery('SELECT * FROM t'), { scale: 100 });
    expect(plan.tables[0].primaryKey).toBeUndefined();
    expect(plan.tables[0].columns.every((c) => c.kind.tag !== 'pk')).toBe(true);
  });

  it('handles a self-referencing foreign key without infinite recursion', async () => {
    const emp = await parseTableDdl(
      'CREATE TABLE employees (id bigint PRIMARY KEY, manager_id bigint REFERENCES employees (id))',
    );
    const plan = deriveSeedPlan([emp], await parseQuery('SELECT * FROM employees'), { scale: 100 });
    expect(plan.tables.map((t) => t.table)).toEqual(['employees']);
    const mgr = plan.tables[0].columns.find((c) => c.name === 'manager_id')!;
    expect(mgr.kind).toEqual({ tag: 'fk', refTable: 'employees', refColumn: 'id' });
  });

  it('orders a 3-table FK chain parents-first and scales middle tables as parents', async () => {
    const u = await parseTableDdl('CREATE TABLE users (id bigint PRIMARY KEY, name text)');
    const o = await parseTableDdl(
      'CREATE TABLE orders (id bigint PRIMARY KEY, user_id bigint REFERENCES users (id))',
    );
    const li = await parseTableDdl(
      'CREATE TABLE line_items (id bigint PRIMARY KEY, order_id bigint REFERENCES orders (id))',
    );
    const shape = await parseQuery(
      'SELECT * FROM line_items li JOIN orders o ON li.order_id = o.id JOIN users u ON o.user_id = u.id',
    );
    const plan = deriveSeedPlan([li, o, u], shape, { scale: 1000 });

    expect(plan.tables.map((t) => t.table)).toEqual(['users', 'orders', 'line_items']);
    const rows = Object.fromEntries(plan.tables.map((t) => [t.table, t.rowCount]));
    expect(rows.line_items).toBe(1000); // leaf gets full scale
    expect(rows.orders).toBeLessThan(1000); // parent of line_items
    expect(rows.users).toBeLessThan(1000); // parent of orders
  });
});

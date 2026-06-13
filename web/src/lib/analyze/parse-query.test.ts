import { describe, it, expect } from 'vitest';
import { parseQuery } from './parse-query';

describe('parseQuery', () => {
  it('extracts the single referenced table', async () => {
    const shape = await parseQuery('SELECT * FROM users');
    expect(shape.tables).toEqual(['users']);
  });

  it('resolves a table alias to the real table name', async () => {
    const shape = await parseQuery('SELECT u.id FROM users u');
    expect(shape.tables).toEqual(['users']);
  });

  it('extracts filter predicates with literals, resolved to their table', async () => {
    const shape = await parseQuery(
      "SELECT * FROM orders o WHERE o.created_at > '2026-01-01' AND o.status = 'paid'",
    );
    expect(shape.filters).toEqual([
      { table: 'orders', column: 'created_at', op: '>', literal: '2026-01-01' },
      { table: 'orders', column: 'status', op: '=', literal: 'paid' },
    ]);
  });

  it('resolves unqualified columns when there is a single table', async () => {
    const shape = await parseQuery('SELECT * FROM orders WHERE total >= 100');
    expect(shape.filters).toEqual([{ table: 'orders', column: 'total', op: '>=', literal: '100' }]);
  });

  it('extracts ORDER BY columns with direction', async () => {
    const shape = await parseQuery('SELECT * FROM orders ORDER BY created_at DESC, id');
    expect(shape.orderBy).toEqual([
      { table: 'orders', column: 'created_at', direction: 'desc' },
      { table: 'orders', column: 'id', direction: 'asc' },
    ]);
  });

  it('extracts GROUP BY columns', async () => {
    const shape = await parseQuery('SELECT user_id FROM orders GROUP BY user_id');
    expect(shape.groupBy).toEqual([{ table: 'orders', column: 'user_id' }]);
  });

  it('extracts an equi-join between two tables', async () => {
    const shape = await parseQuery('SELECT * FROM orders o JOIN users u ON o.user_id = u.id');
    expect(shape.tables).toEqual(['orders', 'users']);
    expect(shape.joins).toEqual([
      { leftTable: 'orders', leftColumn: 'user_id', rightTable: 'users', rightColumn: 'id' },
    ]);
  });

  it('rejects multiple statements (SQL-injection guard)', async () => {
    await expect(parseQuery('SELECT * FROM users; DROP TABLE users')).rejects.toThrow(
      /one SELECT/i,
    );
  });

  it('rejects a non-SELECT statement', async () => {
    await expect(parseQuery('DROP TABLE users')).rejects.toThrow(/SELECT/i);
  });
});

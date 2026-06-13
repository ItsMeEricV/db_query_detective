import { describe, it, expect } from 'vitest';
import { parseQuery } from './parse-query';
import { applicableModes } from './applicable-modes';

const modesFor = async (sql: string) => applicableModes(await parseQuery(sql));

describe('applicableModes', () => {
  it('always includes append_order and shuffled (PK fallback)', async () => {
    expect(await modesFor('SELECT * FROM users')).toEqual(['append_order', 'shuffled']);
  });

  it('adds skewed_range for a range predicate', async () => {
    expect(await modesFor("SELECT * FROM orders WHERE created_at > '2026-01-01'")).toContain(
      'skewed_range',
    );
  });

  it('does not add skewed_range for an equality-only predicate', async () => {
    expect(await modesFor("SELECT * FROM orders WHERE status = 'paid'")).not.toContain(
      'skewed_range',
    );
  });

  it('adds high_skew for an equality filter or GROUP BY', async () => {
    expect(await modesFor("SELECT * FROM orders WHERE status = 'paid'")).toContain('high_skew');
    expect(await modesFor('SELECT user_id FROM orders GROUP BY user_id')).toContain('high_skew');
  });

  it('adds fan_out for a join', async () => {
    expect(await modesFor('SELECT * FROM orders o JOIN users u ON o.user_id = u.id')).toContain(
      'fan_out',
    );
  });

  it('returns modes in canonical order with no duplicates', async () => {
    const modes = await modesFor(
      "SELECT * FROM orders o JOIN users u ON o.user_id = u.id WHERE o.created_at > '2026-01-01' AND o.status = 'paid' GROUP BY o.user_id",
    );
    expect(modes).toEqual(['append_order', 'shuffled', 'skewed_range', 'high_skew', 'fan_out']);
  });
});

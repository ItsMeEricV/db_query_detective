import { describe, it, expect } from 'vitest';
import { parseTableDdl } from '@/lib/ddl/parse-ddl';
import { parseQuery } from './parse-query';
import { DEMO_TABLES, DEMO_QUERIES } from './demo-data';

describe('demo data', () => {
  it('defines the four demo tables in dependency order', () => {
    expect(DEMO_TABLES.map((t) => t.tableName)).toEqual([
      'users',
      'sessions',
      'projects',
      'project_assets',
    ]);
  });

  it('every demo DDL parses and matches its declared table name', async () => {
    for (const t of DEMO_TABLES) {
      const parsed = await parseTableDdl(t.sql);
      expect(parsed.table).toBe(t.tableName);
    }
  });

  it('provides four queries of strictly increasing complexity', () => {
    expect(DEMO_QUERIES).toHaveLength(4);
    expect(DEMO_QUERIES.map((q) => q.complexity)).toEqual([1, 2, 3, 4]);
    for (const q of DEMO_QUERIES) expect(q.sql.trim().length).toBeGreaterThan(0);
  });

  it('every demo query parses and references only demo tables', async () => {
    const known = new Set(DEMO_TABLES.map((t) => t.tableName));
    for (const q of DEMO_QUERIES) {
      const shape = await parseQuery(q.sql);
      expect(shape.tables.length).toBeGreaterThan(0);
      for (const table of shape.tables) expect(known.has(table)).toBe(true);
    }
  });
});

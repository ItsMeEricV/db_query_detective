import { describe, it, expect } from 'vitest';
import { listDdls } from '@/lib/ddl/ddl-service';
import { seedDemoData } from './seed-demo-service';
import { DEMO_QUERIES } from './demo-data';

describe('seedDemoData', () => {
  it('stores the demo schema for the session and returns tables + queries', async () => {
    const sessionId = crypto.randomUUID();

    const result = await seedDemoData(sessionId);

    expect(result.tables.map((t) => t.table)).toEqual([
      'users',
      'sessions',
      'projects',
      'project_assets',
    ]);
    expect(result.queries).toEqual(DEMO_QUERIES);

    const listed = await listDdls(sessionId);
    expect(listed.map((t) => t.table).sort()).toEqual([
      'project_assets',
      'projects',
      'sessions',
      'users',
    ]);
  });
});

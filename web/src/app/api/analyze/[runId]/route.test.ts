import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { upsertDdl } from '@/lib/ddl/ddl-service';
import { runAnalysis } from '@/lib/analyze/analyze-service';

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });

describe('GET /api/analyze/[runId]', () => {
  it('returns a stored run', async () => {
    const sessionId = crypto.randomUUID();
    await upsertDdl({
      sessionId,
      tableName: 'orders',
      sql: 'CREATE TABLE orders (id bigint PRIMARY KEY, created_at timestamptz)',
    });
    const result = await runAnalysis({ sessionId, query: 'SELECT * FROM orders' }, { scale: 100 });

    const res = await GET(new Request('http://test'), ctx(result.runId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string };
    expect(body.runId).toBe(result.runId);
  });

  it('404s for an unknown run id', async () => {
    const res = await GET(new Request('http://test'), ctx(crypto.randomUUID()));
    expect(res.status).toBe(404);
  });
});

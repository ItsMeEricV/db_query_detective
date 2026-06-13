import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { upsertDdl } from '@/lib/ddl/ddl-service';

function analyzeRequest(sessionId: string | null, query: unknown) {
  return new Request('http://test/api/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(sessionId ? { session_id: sessionId } : {}),
    },
    body: JSON.stringify({ query }),
  });
}

describe('POST /api/analyze', () => {
  it('runs an analysis and returns an AnalyzeResult', async () => {
    const sessionId = crypto.randomUUID();
    await upsertDdl({
      sessionId,
      tableName: 'orders',
      sql: 'CREATE TABLE orders (id bigint PRIMARY KEY, created_at timestamptz)',
    });

    const res = await POST(analyzeRequest(sessionId, 'SELECT * FROM orders ORDER BY created_at'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; modes: unknown[]; worstMode: string };
    expect(body.runId).toBeTruthy();
    expect(body.modes.length).toBeGreaterThan(0);
    expect(body.worstMode).toBeTruthy();
  });

  it('400s without a session_id header', async () => {
    const res = await POST(analyzeRequest(null, 'SELECT 1'));
    expect(res.status).toBe(400);
  });

  it('400s for a query against an unknown table', async () => {
    const res = await POST(analyzeRequest(crypto.randomUUID(), 'SELECT * FROM nope'));
    expect(res.status).toBe(400);
  });
});

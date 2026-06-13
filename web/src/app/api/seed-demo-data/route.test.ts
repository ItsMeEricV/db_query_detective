import { describe, it, expect } from 'vitest';
import { POST } from './route';

const request = (sessionId: string | null) =>
  new Request('http://test/api/seed-demo-data', {
    method: 'POST',
    headers: sessionId ? { session_id: sessionId } : {},
  });

describe('POST /api/seed-demo-data', () => {
  it('seeds the demo schema and returns tables + queries', async () => {
    const res = await POST(request(crypto.randomUUID()));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tables: { table: string }[]; queries: unknown[] };
    expect(body.tables.map((t) => t.table)).toContain('users');
    expect(body.queries).toHaveLength(4);
  });

  it('400s without a session_id header', async () => {
    const res = await POST(request(null));
    expect(res.status).toBe(400);
  });
});

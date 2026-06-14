import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { upsertDdl } from '@/lib/ddl/ddl-service';

describe('GET /api/ddls', () => {
  it("returns the session's stored tables", async () => {
    const sessionId = crypto.randomUUID();
    const sql = 'CREATE TABLE users (id integer)';
    await upsertDdl({ sessionId, tableName: 'users', sql });

    const res = await GET(
      new Request('http://test/api/ddls', { headers: { session_id: sessionId } }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { table: string; rawSql: string }[];
    expect(body.map((t) => t.table)).toEqual(['users']);
    expect(body[0].rawSql).toBe(sql);
  });

  it('400s when the session_id header is missing', async () => {
    const res = await GET(new Request('http://test/api/ddls'));
    expect(res.status).toBe(400);
  });
});

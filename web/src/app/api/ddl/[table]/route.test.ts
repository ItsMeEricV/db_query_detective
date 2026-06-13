import { describe, it, expect } from 'vitest';
import { PUT } from './route';
import { listDdls } from '@/lib/ddl/ddl-service';

const ctx = (table: string) => ({ params: Promise.resolve({ table }) });

function putRequest(table: string, sessionId: string, sql: string) {
  return new Request(`http://test/api/ddl/${table}`, {
    method: 'PUT',
    headers: { session_id: sessionId },
    body: sql,
  });
}

describe('PUT /api/ddl/[table]', () => {
  it('stores a DDL and returns the parsed table', async () => {
    const sessionId = crypto.randomUUID();

    const res = await PUT(
      putRequest('users', sessionId, 'CREATE TABLE users (id integer PRIMARY KEY)'),
      ctx('users'),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { table: string; primaryKey: string[] };
    expect(body.table).toBe('users');
    expect(body.primaryKey).toEqual(['id']);
    expect(await listDdls(sessionId)).toHaveLength(1);
  });

  it('400s when the DDL table name does not match the path', async () => {
    const sessionId = crypto.randomUUID();

    const res = await PUT(
      putRequest('orders', sessionId, 'CREATE TABLE customers (id integer)'),
      ctx('orders'),
    );

    expect(res.status).toBe(400);
  });

  it('400s when the session_id header is missing', async () => {
    const res = await PUT(
      new Request('http://test/api/ddl/users', {
        method: 'PUT',
        body: 'CREATE TABLE users (id integer)',
      }),
      ctx('users'),
    );
    expect(res.status).toBe(400);
  });
});

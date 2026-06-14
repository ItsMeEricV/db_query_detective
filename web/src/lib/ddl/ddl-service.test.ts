import { describe, it, expect } from 'vitest';
import { upsertDdl, listDdls, DdlValidationError } from './ddl-service';

// Integration tests — exercise the real Prisma client against the local
// dockerized Postgres (DATABASE_URL set by vitest.config.ts). Each test uses a
// fresh random session id so runs don't collide.
const newSessionId = () => crypto.randomUUID();

describe('ddl-service', () => {
  it('upserts a DDL and lists it back parsed', async () => {
    const sessionId = newSessionId();

    const sql = 'CREATE TABLE users (id integer PRIMARY KEY, email text NOT NULL)';
    const stored = await upsertDdl({ sessionId, tableName: 'users', sql });
    expect(stored.table).toBe('users');
    expect(stored.primaryKey).toEqual(['id']);

    const listed = await listDdls(sessionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].table).toBe('users');
    expect(listed[0].columns.map((c) => c.name)).toEqual(['id', 'email']);
    // GET /ddls carries the raw CREATE TABLE so the UI can pre-fill edits.
    expect(listed[0].rawSql).toBe(sql);
  });

  it('updates the existing row when the same table is PUT again', async () => {
    const sessionId = newSessionId();

    await upsertDdl({ sessionId, tableName: 'widgets', sql: 'CREATE TABLE widgets (id integer)' });
    await upsertDdl({
      sessionId,
      tableName: 'widgets',
      sql: 'CREATE TABLE widgets (id integer, name text)',
    });

    const listed = await listDdls(sessionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].columns.map((c) => c.name)).toEqual(['id', 'name']);
    expect(listed[0].rawSql).toBe('CREATE TABLE widgets (id integer, name text)');
  });

  it('rejects a DDL whose table name does not match the path', async () => {
    await expect(
      upsertDdl({
        sessionId: newSessionId(),
        tableName: 'orders',
        sql: 'CREATE TABLE customers (id integer)',
      }),
    ).rejects.toBeInstanceOf(DdlValidationError);
  });

  it('scopes DDLs to their own session', async () => {
    const a = newSessionId();
    const b = newSessionId();
    await upsertDdl({ sessionId: a, tableName: 'ta', sql: 'CREATE TABLE ta (id integer)' });

    expect(await listDdls(b)).toEqual([]);
  });
});

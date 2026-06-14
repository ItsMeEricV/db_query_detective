import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDdls, ApiError } from './api';

const validDdl = {
  table: 'users',
  columns: [],
  primaryKey: [],
  foreignKeys: [],
  uniques: [],
  indexes: [],
  rawSql: 'CREATE TABLE users (id integer)',
};

function stubFetch(impl: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  const mock = vi.fn().mockResolvedValue(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('parses a 2xx body and sends the session_id header', async () => {
    const mock = stubFetch({ ok: true, status: 200, json: async () => [validDdl] });

    const result = await getDdls();

    expect(result.map((d) => d.table)).toEqual(['users']);
    expect(mock.mock.calls[0]?.[1]?.headers).toHaveProperty('session_id');
  });

  it('surfaces a 400 { error } body verbatim as an ApiError', async () => {
    stubFetch({ ok: false, status: 400, json: async () => ({ error: 'unknown table' }) });

    await expect(getDdls()).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'unknown table',
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    const err = await getDdls().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Request failed (500)');
  });

  it('throws when a 2xx body fails schema validation (contract drift)', async () => {
    stubFetch({ ok: true, status: 200, json: async () => [{ table: 123 }] });
    await expect(getDdls()).rejects.toThrow();
  });
});

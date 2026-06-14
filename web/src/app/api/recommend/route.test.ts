import { describe, expect, test } from 'vitest';
import { POST } from './route';

/** Build a POST Request to the recommend route with a raw (possibly invalid)
 *  JSON body. */
function post(body: string): Request {
  return new Request('http://localhost/api/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/recommend input validation', () => {
  // These branches return before any run lookup or LLM call, so no mocks needed.
  test('rejects a non-JSON body with 400', async () => {
    const res = await POST(post('not json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  test('rejects a body missing runId with 400', async () => {
    const res = await POST(post(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Body must include a "runId" string' });
  });

  test('rejects an empty runId with 400', async () => {
    const res = await POST(post(JSON.stringify({ runId: '' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Body must include a "runId" string' });
  });

  // Past validation: a well-formed but unknown runId loads no run → 404 (before
  // any LLM call). Mirrors GET /api/analyze/[runId]'s unknown-id behavior.
  test('returns 404 for a well-formed but unknown runId', async () => {
    const res = await POST(post(JSON.stringify({ runId: crypto.randomUUID() })));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Run not found' });
  });
});

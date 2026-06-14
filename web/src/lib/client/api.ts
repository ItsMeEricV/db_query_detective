/**
 * Browser API client for the db_query_detective REST endpoints. Every call
 * carries the `session_id` header and Zod-parses the response at the boundary,
 * so callers (TanStack Query hooks) receive validated, fully-typed data. A
 * non-2xx response is surfaced as an {@link ApiError} carrying the server's
 * `{ error }` message verbatim, so the UI can render 400s inline.
 */
import {
  ParsedTableSchema,
  StoredDdlSchema,
  type ParsedTable,
  type StoredDdl,
} from '@/lib/ddl/parsed-table';
import { AnalyzeResultSchema, type AnalyzeResult } from '@/lib/analyze/analyze-result';
import { SeedDemoResponseSchema, type SeedDemoResponse } from '@/lib/analyze/demo-data';
import { getSessionId } from './session';

/** A failed API call. `status` is the HTTP code; `message` is the server's
 *  `{ error }` text when present, else a generic fallback. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      message = body.error;
    }
  } catch {
    // Non-JSON error body — keep the generic message.
  }
  return new ApiError(res.status, message);
}

function headers(extra?: HeadersInit): HeadersInit {
  return { session_id: getSessionId(), ...extra };
}

/** GET /api/ddls — the session's tables (parsed structure + rawSql). */
export async function getDdls(): Promise<StoredDdl[]> {
  const res = await fetch('/api/ddls', { headers: headers() });
  if (!res.ok) throw await errorFrom(res);
  return StoredDdlSchema.array().parse(await res.json());
}

/** PUT /api/ddl/{table} — upsert one table from raw CREATE TABLE SQL. */
export async function putDdl(table: string, sql: string): Promise<ParsedTable> {
  const res = await fetch(`/api/ddl/${encodeURIComponent(table)}`, {
    method: 'PUT',
    headers: headers({ 'content-type': 'text/plain' }),
    body: sql,
  });
  if (!res.ok) throw await errorFrom(res);
  return ParsedTableSchema.parse(await res.json());
}

/** POST /api/analyze — run the query across applicable modes. */
export async function analyze(query: string): Promise<AnalyzeResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw await errorFrom(res);
  return AnalyzeResultSchema.parse(await res.json());
}

/** POST /api/seed-demo-data — load the demo schema + return the query ladder. */
export async function seedDemoData(): Promise<SeedDemoResponse> {
  const res = await fetch('/api/seed-demo-data', { method: 'POST', headers: headers() });
  if (!res.ok) throw await errorFrom(res);
  return SeedDemoResponseSchema.parse(await res.json());
}

/** DELETE /api/ddls — clear all of the session's DDLs and analysis runs. */
export async function clearDdls(): Promise<void> {
  const res = await fetch('/api/ddls', { method: 'DELETE', headers: headers() });
  if (!res.ok) throw await errorFrom(res);
}

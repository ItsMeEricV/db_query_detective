import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { parseTableDdl } from './parse-ddl';
import { type ParsedTable, ParsedTableSchema } from './parsed-table';

// session_id is a client-supplied opaque token (placeholder auth in v1). We
// validate it's a well-formed UUID but accept ANY version — `.uuid()` is
// version-agnostic, and pinning the version of an externally-provided id buys
// nothing. IDs *we* generate (Ddl.id, AnalysisRun.id, and Session.id when it
// isn't client-supplied) are UUIDv7 via Prisma's `@default(uuid(7))`.
export const SessionIdSchema = z.string().uuid();

export const UpsertDdlInputSchema = z.object({
  sessionId: SessionIdSchema,
  tableName: z.string().min(1),
  sql: z.string().min(1),
});
export type UpsertDdlInput = z.infer<typeof UpsertDdlInputSchema>;

/** Thrown when the submitted DDL is invalid for the request (maps to HTTP 400). */
export class DdlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DdlValidationError';
  }
}

/**
 * Upsert one table's DDL for a session (PUT /ddl/{tableName}). Parses the SQL,
 * asserts the parsed table name matches the path, lazily creates the session,
 * and upserts on (sessionId, tableName). Returns the parsed table.
 */
export async function upsertDdl(input: UpsertDdlInput): Promise<ParsedTable> {
  const { sessionId, tableName, sql } = UpsertDdlInputSchema.parse(input);

  let parsed: ParsedTable;
  try {
    parsed = await parseTableDdl(sql);
  } catch (err) {
    throw new DdlValidationError(err instanceof Error ? err.message : 'Could not parse DDL');
  }

  if (parsed.table !== tableName) {
    throw new DdlValidationError(
      `DDL defines table "${parsed.table}" but the path names "${tableName}"`,
    );
  }

  // ParsedTable is a validated domain object; store it into the Json column.
  const parsedJson = parsed as unknown as Prisma.InputJsonValue;

  await prisma.session.upsert({ where: { id: sessionId }, create: { id: sessionId }, update: {} });
  await prisma.ddl.upsert({
    where: { sessionId_tableName: { sessionId, tableName } },
    create: { sessionId, tableName, rawSql: sql, parsed: parsedJson },
    update: { rawSql: sql, parsed: parsedJson },
  });

  return parsed;
}

/** List a session's tables as parsed structures (GET /ddls). */
export async function listDdls(sessionId: string): Promise<ParsedTable[]> {
  const id = SessionIdSchema.parse(sessionId);
  const rows = await prisma.ddl.findMany({
    where: { sessionId: id },
    orderBy: { tableName: 'asc' },
  });
  return rows.map((row) => ParsedTableSchema.parse(row.parsed));
}

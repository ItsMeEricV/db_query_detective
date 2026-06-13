import { ZodError } from 'zod';
import { DdlValidationError, SessionIdSchema, upsertDdl } from '@/lib/ddl/ddl-service';

/** PUT /api/ddl/{table} — upsert one table's DDL (raw CREATE TABLE in the body). */
export async function PUT(request: Request, { params }: { params: Promise<{ table: string }> }) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  const { table } = await params;
  const sql = await request.text();

  try {
    const parsed = await upsertDdl({ sessionId: session.data, tableName: table, sql });
    return Response.json(parsed);
  } catch (err) {
    if (err instanceof DdlValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ZodError) {
      return Response.json(
        { error: 'Invalid request: a non-empty CREATE TABLE body is required' },
        { status: 400 },
      );
    }
    throw err;
  }
}

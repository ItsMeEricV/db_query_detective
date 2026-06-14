import { ZodError } from 'zod';
import { clearSessionData, listDdls, SessionIdSchema } from '@/lib/ddl/ddl-service';

/** GET /api/ddls — list the session's stored tables as ParsedTable[]. */
export async function GET(request: Request) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  const ddls = await listDdls(session.data);
  return Response.json(ddls);
}

/** DELETE /api/ddls — clear all of the session's DDLs and analysis runs. */
export async function DELETE(request: Request) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  try {
    await clearSessionData(session.data);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    throw err;
  }
}

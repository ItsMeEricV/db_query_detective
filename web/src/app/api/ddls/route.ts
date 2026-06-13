import { listDdls, SessionIdSchema } from '@/lib/ddl/ddl-service';

/** GET /api/ddls — list the session's stored tables as ParsedTable[]. */
export async function GET(request: Request) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  const ddls = await listDdls(session.data);
  return Response.json(ddls);
}

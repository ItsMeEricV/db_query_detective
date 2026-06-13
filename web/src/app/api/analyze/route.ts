import { ZodError } from 'zod';
import { SessionIdSchema } from '@/lib/ddl/ddl-service';
import { runAnalysis, AnalyzeValidationError } from '@/lib/analyze/analyze-service';

/** POST /api/analyze — body { query }. Runs the query across applicable modes. */
export async function POST(request: Request) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const query = (body as { query?: unknown }).query;
  if (typeof query !== 'string' || !query.trim()) {
    return Response.json(
      { error: 'Body must include a non-empty "query" string' },
      { status: 400 },
    );
  }

  try {
    return Response.json(await runAnalysis({ sessionId: session.data, query }));
  } catch (err) {
    if (err instanceof AnalyzeValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ZodError) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    throw err;
  }
}

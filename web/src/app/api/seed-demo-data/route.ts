import { SessionIdSchema } from '@/lib/ddl/ddl-service';
import { seedDemoData } from '@/lib/analyze/seed-demo-service';

/** POST /api/seed-demo-data — load the demo schema into the session and return
 *  the parsed tables + the demo query ladder. */
export async function POST(request: Request) {
  const session = SessionIdSchema.safeParse(request.headers.get('session_id'));
  if (!session.success) {
    return Response.json({ error: 'A valid session_id header is required' }, { status: 400 });
  }

  return Response.json(await seedDemoData(session.data));
}

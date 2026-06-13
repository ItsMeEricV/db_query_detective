import { getAnalysisRun } from '@/lib/analyze/analyze-service';

/** GET /api/analyze/{runId} — read back a stored analysis run. */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getAnalysisRun(runId);
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });
  return Response.json(run);
}

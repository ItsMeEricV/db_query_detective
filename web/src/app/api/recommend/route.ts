import { getAnalysisRun } from '@/lib/analyze/analyze-service';
import { streamRecommendation } from '@/lib/llm/recommend';
import { logger } from '@/lib/logger';

// Streams an LLM Recommendation; allow generous time on Vercel (matches /analyze).
export const maxDuration = 60;

/**
 * POST /api/recommend — body `{ runId }`. Loads the persisted run server-side
 * and streams a Recommendation built from its measured facts. Thin transport:
 * validate input, load the run, hand off to the application layer.
 *
 * `useCompletion` also sends a `prompt` field; we ignore it and read `runId`
 * (the client attaches it via `complete('', { body: { runId } })`).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const runId = (body as { runId?: unknown }).runId;
  if (typeof runId !== 'string' || !runId) {
    return Response.json({ error: 'Body must include a "runId" string' }, { status: 400 });
  }

  const run = await getAnalysisRun(runId);
  if (!run) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  logger.info('recommend.start', {
    runId,
    worstMode: run.worstMode,
    modes: run.modes.length,
  });

  return streamRecommendation(run).toUIMessageStreamResponse();
}

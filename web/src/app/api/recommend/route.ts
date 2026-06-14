import type { AnalyzeResult } from '@/lib/analyze/analyze-result';
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

  let run: AnalyzeResult | null;
  try {
    run = await getAnalysisRun(runId);
  } catch (err) {
    // DB error, or a stored run whose shape has drifted (Zod parse). Log through
    // the seam (opaque fields only) — don't let it escape as an unlogged 500.
    logger.error('recommend.lookup_failed', {
      runId,
      message: err instanceof Error ? err.message : 'unknown error',
    });
    return Response.json({ error: 'Could not load the analysis run' }, { status: 500 });
  }
  if (!run) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  logger.info('recommend.start', {
    runId,
    worstMode: run.worstMode,
    modes: run.modes.length,
  });

  // streamText itself is async (its failures surface via the lib's onError and
  // the stream's error event); guard only the synchronous construction here so a
  // throw building the prompt/model is logged, not a raw 500.
  try {
    return streamRecommendation(run).toUIMessageStreamResponse();
  } catch (err) {
    logger.error('recommend.error', {
      runId,
      message: err instanceof Error ? err.message : 'unknown error',
    });
    return Response.json({ error: 'Could not generate a recommendation' }, { status: 500 });
  }
}

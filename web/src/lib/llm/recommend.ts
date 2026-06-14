import { streamText } from 'ai';
import type { AnalyzeResult } from '@/lib/analyze/analyze-result';
import { logger } from '@/lib/logger';
import { recommendationModel } from './model';
import { buildRecommendationPrompt } from './recommendation-prompt';

/**
 * Stream a query Recommendation for one analysis run. The application-layer
 * entry point the route adapts: it owns prompt construction + the model call,
 * staying vendor-neutral (the provider lives in ./model). Returns the streaming
 * result; the route turns it into an HTTP stream.
 *
 * Logs only opaque fields on finish/error (runId, token counts, durationMs) —
 * never the query, plan, or generated text (AGENTS.md logging hygiene).
 */
export function streamRecommendation(run: AnalyzeResult) {
  const startedAt = Date.now();
  const { system, prompt } = buildRecommendationPrompt(run);

  return streamText({
    model: recommendationModel(),
    system,
    prompt,
    onFinish: ({ usage, finishReason }) => {
      logger.info('recommend.finish', {
        runId: run.runId,
        finishReason,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs: Date.now() - startedAt,
      });
    },
    onError: ({ error }) => {
      logger.error('recommend.error', {
        runId: run.runId,
        message: error instanceof Error ? error.message : 'unknown error',
      });
    },
  });
}

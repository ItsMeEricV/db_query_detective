import Markdown from 'react-markdown';
import type { AnalyzeResult } from '@/lib/analyze/analyze-result';
import { modeLabel } from '@/lib/analyze/labels';
import { strings } from '@/lib/strings';
import { Button } from './Button';

/**
 * The hosted LLM step (SPEC milestone 3): a user-triggered button that streams
 * the detective's Recommendation for the worst query plan. Strictly
 * presentational — the streaming hook + reset live in the smart container
 * (detective-app.tsx); this renders the button, the live report, and the
 * verify-before-applying disclaimer.
 */
export function DetectivePanel({
  result,
  recommendation,
  isLoading,
  error,
  onAsk,
}: {
  result: AnalyzeResult | undefined;
  recommendation: string;
  isLoading: boolean;
  error: Error | undefined;
  onAsk: () => void;
}) {
  if (!result) {
    return <p className="py-6 text-sm text-muted">{strings.detective.emptyHint}</p>;
  }

  const hasReport = recommendation.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="text-2xl leading-none" aria-hidden>
          🕵️‍♀️
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            {strings.detective.intro}
          </p>
          <p className="font-mono text-xs text-faint">
            {strings.analysis.worstLabel}: {modeLabel(result.worstMode)} · {result.modes.length}{' '}
            mode
            {result.modes.length === 1 ? '' : 's'} measured
          </p>
          <Button
            variant="primary"
            onClick={onAsk}
            disabled={isLoading}
            data-testid="detective-ask"
          >
            {isLoading ? strings.detective.asking : strings.detective.ask}
          </Button>
        </div>
      </div>

      {isLoading && !hasReport && (
        <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
          <span className="report-caret" aria-hidden />
          {strings.detective.asking}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          <span aria-hidden>⚠</span>
          {strings.detective.error}
        </p>
      )}

      {hasReport && (
        <article
          data-testid="detective-report"
          className="rounded-md border border-line-strong bg-surface-2/30 px-5 py-4"
        >
          <div className="mb-3 border-b border-line pb-2 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent">
            {strings.detective.reportLabel}
          </div>
          <div className="report" aria-live="polite">
            <Markdown>{recommendation}</Markdown>
            {isLoading && <span className="report-caret" aria-hidden />}
          </div>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-faint">
            <span aria-hidden>🔎</span>
            {strings.detective.disclaimer}
          </p>
        </article>
      )}
    </div>
  );
}

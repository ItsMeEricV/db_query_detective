import type { AnalyzeResult } from '@/lib/analyze/analyze-result';
import { modeLabel } from '@/lib/analyze/labels';
import { strings } from '@/lib/strings';
import { Tag } from './Tag';

/**
 * Stub for the milestone-3 LLM detective. It already receives the AnalyzeResult,
 * so wiring up the Bedrock-backed narration later is a matter of filling this
 * body — the contract and placement don't change.
 */
export function DetectivePanel({ result }: { result: AnalyzeResult | undefined }) {
  if (!result) {
    return <p className="py-6 text-sm text-muted">{strings.detective.emptyHint}</p>;
  }

  return (
    <div className="flex items-start gap-4 rounded-md border border-dashed border-line-strong bg-surface-2/30 px-5 py-5">
      <span className="text-2xl leading-none" aria-hidden>
        🕵️‍♀️
      </span>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg text-ink">{strings.detective.comingSoonTitle}</h3>
          <Tag tone="accent">soon</Tag>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted">
          {strings.detective.comingSoonHint}
        </p>
        <p className="font-mono text-xs text-faint">
          {strings.analysis.worstLabel}: {modeLabel(result.worstMode)} · {result.modes.length} mode
          {result.modes.length === 1 ? '' : 's'} measured
        </p>
      </div>
    </div>
  );
}

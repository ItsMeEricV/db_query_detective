'use client';

import type { DemoQuery } from '@/lib/analyze/demo-data';
import { strings } from '@/lib/strings';
import { Button } from '../Button';

/** The DML band body: demo-query chips, the query textarea, and Analyze.
 *  Presentational — the query value and the run action are owned by the
 *  container. */
export function DmlPanel({
  query,
  onQueryChange,
  demoQueries,
  onAnalyze,
  analyzing,
  analyzeError,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  demoQueries: DemoQuery[];
  onAnalyze: () => void;
  analyzing: boolean;
  analyzeError: string | null;
}) {
  const canAnalyze = query.trim().length > 0 && !analyzing;

  return (
    <div className="space-y-4">
      {demoQueries.length > 0 && (
        <div className="space-y-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
            {strings.dml.demoChipsLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            {demoQueries.map((q) => (
              <button
                key={q.title}
                onClick={() => onQueryChange(q.sql)}
                title={q.description}
                className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/50 py-1 pl-1.5 pr-3 text-sm text-ink transition-colors hover:border-accent/50 hover:text-accent"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface font-mono text-[0.7rem] text-muted group-hover:text-accent">
                  {q.complexity}
                </span>
                {q.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="dml-query"
          className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint"
        >
          {strings.dml.queryLabel}
        </label>
        <textarea
          id="dml-query"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          spellCheck={false}
          rows={7}
          placeholder={strings.dml.queryPlaceholder}
          className="scrollbar-thin w-full resize-y rounded-md border border-line bg-surface-2/60 px-3 py-3 font-mono text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent/60"
        />
      </div>

      {analyzeError && (
        <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 font-mono text-xs text-bad">
          {analyzeError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={onAnalyze} disabled={!canAnalyze}>
          {analyzing ? strings.dml.analyzing : strings.dml.analyze}
        </Button>
        {analyzing && (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner />
            {strings.dml.analyzing}
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent"
    />
  );
}

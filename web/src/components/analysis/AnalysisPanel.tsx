'use client';

import { useState } from 'react';
import type { AnalyzeResult, ModeResult } from '@/lib/analyze/analyze-result';
import { modeLabel } from '@/lib/analyze/labels';
import { summarizeRun } from '@/lib/analyze/analysis-summary';
import { formatCost, formatEstimateRatio, formatMs, formatRows } from '@/lib/format';
import { strings } from '@/lib/strings';
import { FlagBadge } from '../FlagBadge';
import { Tag } from '../Tag';

const MISESTIMATE_THRESHOLD = 10; // mirrors the engine's rows_misestimated detector

/** The Analysis sub-section: a per-mode comparison table with the worst mode
 *  highlighted, each row expandable to its findings + raw EXPLAIN plan. */
export function AnalysisPanel({
  result,
  analyzing,
}: {
  result: AnalyzeResult | undefined;
  analyzing: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!result) {
    return (
      <p className="py-6 text-sm text-muted">
        {analyzing ? strings.dml.analyzing : strings.analysis.emptyHint}
      </p>
    );
  }

  // Most expensive first — the comparison reads top-down from worst to best.
  const modes = [...result.modes].sort((a, b) => b.metrics.rootTotalCost - a.metrics.rootTotalCost);
  const worst = result.modes.find((m) => m.mode === result.worstMode);
  const { allZeroRows, flatCost } = summarizeRun(result);

  return (
    <div className="space-y-4">
      {worst && (
        <p className="text-sm text-muted">
          {strings.analysis.worstLabel}:{' '}
          <span className="font-mono text-bad">{modeLabel(worst.mode)}</span>
          {' — '}
          {strings.analysis.colCost.toLowerCase()}{' '}
          <span className="font-mono text-ink">{formatCost(worst.metrics.rootTotalCost)}</span>
        </p>
      )}

      {(allZeroRows || flatCost) && (
        <div className="space-y-1.5">
          {allZeroRows && <Note text={strings.analysis.zeroRowsNote} />}
          {flatCost && <Note text={strings.analysis.flatCostNote} />}
        </div>
      )}

      <div className="scrollbar-thin overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/50 text-left font-mono text-[0.7rem] uppercase tracking-[0.12em] text-faint">
              <Th className="w-8" label="" />
              <Th label={strings.analysis.colMode} />
              <Th label={strings.analysis.colCost} align="right" />
              <Th label={strings.analysis.colExec} align="right" />
              <Th label={strings.analysis.colEstRows} align="right" />
              <Th label={strings.analysis.colActualRows} align="right" />
              <Th label={strings.analysis.colEstimate} align="right" />
              <Th label={strings.analysis.colFlags} align="right" />
            </tr>
          </thead>
          <tbody>
            {modes.map((m) => (
              <ModeRows
                key={m.mode}
                mode={m}
                isWorst={m.mode === result.worstMode}
                isOpen={expanded === m.mode}
                onToggle={() => setExpanded((cur) => (cur === m.mode ? null : m.mode))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">
      <span className="mt-px text-warn" aria-hidden>
        ⚠
      </span>
      {text}
    </p>
  );
}

function Th({
  label,
  align = 'left',
  className = '',
}: {
  label: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {label}
    </th>
  );
}

function ModeRows({
  mode,
  isWorst,
  isOpen,
  onToggle,
}: {
  mode: ModeResult;
  isWorst: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { metrics, flags } = mode;
  const misestimated =
    metrics.estimatedRows > 0 &&
    metrics.actualRows > 0 &&
    Math.max(
      metrics.estimatedRows / metrics.actualRows,
      metrics.actualRows / metrics.estimatedRows,
    ) >= MISESTIMATE_THRESHOLD;

  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`cursor-pointer border-b border-line/60 transition-colors ${
          isWorst ? 'bg-bad/[0.07] hover:bg-bad/[0.11]' : 'hover:bg-surface-2/40'
        }`}
      >
        <td className="px-3 py-2.5 text-center font-mono text-xs text-faint">
          {isOpen ? '▾' : '▸'}
        </td>
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span className="font-mono text-ink">{modeLabel(mode.mode)}</span>
            {isWorst && <Tag tone="bad">{strings.analysis.worstBadge}</Tag>}
          </span>
        </td>
        <td className={`px-3 py-2.5 text-right font-mono ${isWorst ? 'text-bad' : 'text-ink'}`}>
          {formatCost(metrics.rootTotalCost)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-muted">
          {formatMs(metrics.executionTimeMs)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-muted">
          {formatRows(metrics.estimatedRows)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-muted">
          {formatRows(metrics.actualRows)}
        </td>
        <td
          className={`px-3 py-2.5 text-right font-mono ${misestimated ? 'text-warn' : 'text-muted'}`}
        >
          {formatEstimateRatio(metrics.estimatedRows, metrics.actualRows)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-muted">
          {flags.length > 0 ? (
            <span className="text-warn">{flags.length}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-line/60 bg-surface/50">
          <td colSpan={8} className="px-4 py-4">
            <ModeDetail mode={mode} />
          </td>
        </tr>
      )}
    </>
  );
}

function ModeDetail({ mode }: { mode: ModeResult }) {
  const rowCounts = Object.entries(mode.rowCounts);
  return (
    <div className="space-y-4">
      {rowCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
            {strings.analysis.rowCounts}
          </span>
          {rowCounts.map(([table, n]) => (
            <Tag key={table} tone="muted">
              {table}: {formatRows(n)}
            </Tag>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {strings.analysis.colFlags}
        </span>
        {mode.flags.length > 0 ? (
          mode.flags.map((flag, i) => <FlagBadge key={`${flag.code}-${i}`} flag={flag} />)
        ) : (
          <span className="text-sm text-faint">{strings.analysis.noFlags}</span>
        )}
      </div>

      <details className="group">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 font-mono text-xs text-muted hover:text-accent">
          <span className="transition-transform group-open:rotate-90">▸</span>
          {strings.analysis.rawPlan}
        </summary>
        <pre className="scrollbar-thin mt-2 max-h-96 overflow-auto rounded-md border border-line bg-surface-2/40 p-3 font-mono text-xs leading-relaxed text-muted">
          {JSON.stringify(mode.plan, null, 2)}
        </pre>
      </details>
    </div>
  );
}

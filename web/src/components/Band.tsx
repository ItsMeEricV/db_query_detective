import type { ReactNode } from 'react';

/**
 * A labeled section band — the repeating shell behind DDL / DML / Detective.
 * The label is a stamped, letter-spaced mono tab echoing the hand mock's boxed
 * section labels; `action` holds header-right controls (e.g. "Load demo data").
 */
export function Band({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-line bg-surface/60">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent">
            {label}
          </span>
          {hint ? <span className="text-xs text-muted">({hint})</span> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

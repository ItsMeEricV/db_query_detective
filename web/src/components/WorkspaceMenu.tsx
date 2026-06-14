'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { strings } from '@/lib/strings';

/**
 * A kebab (⋮) menu holding the session-level actions — "Load demo data" and
 * "Clear all" — that used to sit in the DDL band header. Presentational: the
 * callbacks + disabled state come from the container. (The brand-new-session
 * "Load demo data" CTA still lives in the DDL empty state.)
 */
export function WorkspaceMenu({
  onLoadDemo,
  loadingDemo,
  onClearAll,
  clearDisabled,
}: {
  onLoadDemo: () => void;
  loadingDemo: boolean;
  onClearAll: () => void;
  clearDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape. Event listeners, not data fetching — fine
  // for a presentational component (per ARCHITECTURE's useEffect rule).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={strings.menu.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface-2/40 text-muted transition-colors hover:border-accent/60 hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-md border border-line-strong bg-surface shadow-lg shadow-black/30"
        >
          <MenuItem onClick={choose(onLoadDemo)} disabled={loadingDemo}>
            {loadingDemo ? strings.ddl.loading : strings.ddl.loadDemo}
          </MenuItem>
          <MenuItem onClick={choose(onClearAll)} disabled={clearDisabled} danger>
            {strings.ddl.clearAll}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-bad hover:bg-bad/10' : 'text-ink hover:bg-surface-2/70'
      }`}
    >
      {children}
    </button>
  );
}

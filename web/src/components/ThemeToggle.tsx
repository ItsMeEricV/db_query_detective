'use client';

import type { ReactNode } from 'react';
import { useTheme } from '@/lib/client/hooks';
import { THEMES, type Theme } from '@/lib/client/theme';
import { strings } from '@/lib/strings';

/**
 * A compact three-segment control to pick System / Light / Dark. Hydration-safe:
 * the active segment comes from the theme store via useSyncExternalStore, which
 * renders the server snapshot ('system') during hydration and swaps to the
 * stored choice after — no mismatch. The actual page colors are applied earlier
 * by the no-flash script in layout.tsx.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={strings.theme.label}
      className="inline-flex overflow-hidden rounded-md border border-line bg-surface-2/40"
    >
      {THEMES.map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={strings.theme[t]}
            title={strings.theme[t]}
            onClick={() => setTheme(t)}
            className={`flex h-7 w-7 items-center justify-center transition-colors ${
              active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {ICONS[t]}
          </button>
        );
      })}
    </div>
  );
}

const svgProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICONS: Record<Theme, ReactNode> = {
  system: (
    <svg {...svgProps}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  light: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg {...svgProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

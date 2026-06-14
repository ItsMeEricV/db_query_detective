/**
 * Client-side theme preference, backed by localStorage. Three choices:
 * `'system'` (default — follow the OS via prefers-color-scheme), `'light'`, and
 * `'dark'`. A non-system choice sets `data-theme` on <html>, which the CSS in
 * globals.css uses to override the OS; `'system'` removes the attribute so the
 * media query takes over.
 *
 * The same key is read by the no-flash inline script in layout.tsx (kept in sync
 * here as THEME_KEY's literal) so the stored choice applies before first paint.
 * Every accessor is SSR-safe (`typeof window` guard).
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

const THEME_KEY = 'dqd.theme';
/** Fired on write so the in-tab useSyncExternalStore subscription re-reads (the
 *  native `storage` event only fires in other tabs). */
const THEME_EVENT = 'dqd:theme';

function isTheme(v: string | null): v is Theme {
  return v === 'system' || v === 'light' || v === 'dark';
}

/** The stored theme choice, or `'system'` when unset/invalid. */
export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(THEME_KEY);
  return isTheme(raw) ? raw : 'system';
}

/** Apply a choice to <html>: explicit themes set data-theme; system clears it. */
function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

/** Persist + apply a theme choice, notifying subscribers in this tab. */
export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

// --- useSyncExternalStore adapters -------------------------------------------
// The server snapshot is always 'system' (matches the SSR-rendered HTML, which
// carries no data-theme); the client snapshot is the stored choice; React swaps
// after hydration with no mismatch. Snapshots are string primitives, so no
// reference caching is needed.

export function getThemeSnapshot(): Theme {
  return getTheme();
}

export function getThemeServerSnapshot(): Theme {
  return 'system';
}

export function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

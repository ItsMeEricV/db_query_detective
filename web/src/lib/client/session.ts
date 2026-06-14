/**
 * Client-side session identity and demo-query cache, both backed by
 * localStorage. The `session_id` is a placeholder for real auth (see KNOWLEDGE.md
 * "Session"): a client-generated UUID that scopes this browser's DDLs and
 * analysis runs, sent as the `session_id` header on every request.
 *
 * The 4 demo queries returned by POST /seed-demo-data aren't persisted
 * server-side, so we cache them here to keep the chip row alive across reloads.
 *
 * Every accessor is SSR-safe (`typeof window` guard) so importing this module
 * from a component that also server-renders never throws.
 */
import { type DemoQuery, DemoQuerySchema } from '@/lib/analyze/demo-data';

const SESSION_KEY = 'dqd.session_id';
const DEMO_QUERIES_KEY = 'dqd.demo_queries';

/**
 * The browser's session id, created and persisted on first read. Returns an
 * empty string during SSR (no window) — callers run inside client-only fetch
 * paths, where window is always present.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}

/** The cached demo queries, or [] if none/invalid. Tolerant of malformed JSON. */
export function getCachedDemoQueries(): DemoQuery[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_QUERIES_KEY);
  if (!raw) return [];
  try {
    const parsed = DemoQuerySchema.array().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function setCachedDemoQueries(queries: DemoQuery[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_QUERIES_KEY, JSON.stringify(queries));
}

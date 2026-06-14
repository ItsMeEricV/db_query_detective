/**
 * The single logging seam for server code. AGENTS.md forbids bare `console.log`
 * everywhere else: routing every log line through here means transports
 * (Axiom/Datadog/…) and request context can be swapped in one place later
 * without touching call sites. Console-backed for now; intentionally skinny.
 *
 * Structured over freeform: callers pass an `event` slug plus indexable fields,
 * emitted as one JSON line. NEVER pass PII or raw user SQL — log opaque
 * identifiers (`runId`, `worstMode`, `durationMs`) only. Treat every field as
 * publicly visible.
 */

type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, event, ...fields });
  // This module is the one sanctioned console boundary (see AGENTS.md).
  console[level](line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

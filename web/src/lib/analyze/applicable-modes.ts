import { ALL_MODES, type ModeName } from '@/lib/engine/modes';
import type { QueryShape } from './query-shape';

const RANGE_OPS = new Set(['<', '<=', '>', '>=']);
const EQUALITY_OPS = new Set(['=', '<>']);

/**
 * Derive which modes are worth running for a query. `append_order`/`shuffled`
 * always apply (they fall back to PK ordering when there's no ordered axis); the
 * rest are added only when the query exercises their axis. Returned in canonical
 * order. See ARCHITECTURE.md ("Modes").
 */
export function applicableModes(shape: QueryShape): ModeName[] {
  const modes = new Set<ModeName>(['append_order', 'shuffled']);

  if (shape.filters.some((f) => RANGE_OPS.has(f.op))) modes.add('skewed_range');
  if (shape.filters.some((f) => EQUALITY_OPS.has(f.op)) || shape.groupBy.length > 0) {
    modes.add('high_skew');
  }
  if (shape.joins.length > 0) modes.add('fan_out');

  return ALL_MODES.filter((m) => modes.has(m));
}

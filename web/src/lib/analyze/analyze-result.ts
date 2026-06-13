import { z } from 'zod';
import { ParsedTableSchema } from '@/lib/ddl/parsed-table';

export const ModeNameSchema = z.enum([
  'append_order',
  'shuffled',
  'skewed_range',
  'high_skew',
  'fan_out',
]);

/** Convenience numbers extracted from the verbatim EXPLAIN plan (plan[0]). */
export const ModeMetricsSchema = z.object({
  planningTimeMs: z.number(),
  executionTimeMs: z.number(),
  rootStartupCost: z.number(),
  rootTotalCost: z.number(),
  estimatedRows: z.number(),
  actualRows: z.number(),
});

/** A measured fact, never advice. Open-ended code set. */
export const ModeFlagSchema = z.object({
  code: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const ModeResultSchema = z.object({
  mode: ModeNameSchema,
  rowCounts: z.record(z.string(), z.number()),
  /** Verbatim EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) output — a
   *  single-element array; elements kept opaque. */
  plan: z.array(z.unknown()),
  metrics: ModeMetricsSchema,
  flags: z.array(ModeFlagSchema),
});

export const AnalyzeResultSchema = z.object({
  runId: z.string(),
  query: z.string(),
  schemaSnapshot: z.array(ParsedTableSchema),
  worstMode: ModeNameSchema,
  modes: z.array(ModeResultSchema),
});

export type ModeMetrics = z.infer<typeof ModeMetricsSchema>;
export type ModeFlag = z.infer<typeof ModeFlagSchema>;
export type ModeResult = z.infer<typeof ModeResultSchema>;
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

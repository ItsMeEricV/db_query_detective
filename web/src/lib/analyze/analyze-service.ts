import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { ParsedTableSchema, type ParsedTable } from '@/lib/ddl/parsed-table';
import { SessionIdSchema } from '@/lib/ddl/ddl-service';
import type { ModeName } from '@/lib/engine/modes';
import { hashSeed } from '@/lib/engine/seeder';
import { runModes, QueryExecutionError } from '@/lib/engine/run';
import { applicableModes } from './applicable-modes';
import { deriveSeedPlan } from './seed-plan';
import { parseQuery } from './parse-query';
import { AnalyzeResultSchema, type AnalyzeResult, type ModeResult } from './analyze-result';

// v1 default scale. Modest because the loader uses batched INSERT, not COPY —
// snappy for a demo; COPY + a higher default is a follow-up.
const DEFAULT_SCALE = 5_000;

export const AnalyzeInputSchema = z.object({
  sessionId: SessionIdSchema,
  query: z.string().min(1),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

/** Thrown for client-fixable problems (bad query, unknown table) → HTTP 400. */
export class AnalyzeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzeValidationError';
  }
}

/**
 * Run a query through every applicable mode and persist the run. Synchronous in
 * v1 (the HTTP layer awaits this). Returns the full result.
 */
export async function runAnalysis(
  input: AnalyzeInput,
  opts: { scale?: number } = {},
): Promise<AnalyzeResult> {
  const { sessionId, query } = AnalyzeInputSchema.parse(input);

  let shape;
  try {
    shape = await parseQuery(query);
  } catch (err) {
    throw new AnalyzeValidationError(err instanceof Error ? err.message : 'Could not parse query');
  }
  if (shape.tables.length === 0) throw new AnalyzeValidationError('Query references no tables');

  const ddlByName = new Map(
    (await prisma.ddl.findMany({ where: { sessionId } })).map((r) => [r.tableName, r]),
  );

  // FK closure of the query's tables, so every FK-referenced parent exists when
  // the schema is built.
  const closure = new Set<string>();
  const addClosure = (table: string) => {
    if (closure.has(table)) return;
    const row = ddlByName.get(table);
    if (!row) throw new AnalyzeValidationError(`No DDL for table "${table}" in this session`);
    closure.add(table);
    for (const fk of ParsedTableSchema.parse(row.parsed).foreignKeys) addClosure(fk.refTable);
  };
  for (const table of shape.tables) addClosure(table);

  const tables = [...closure];
  const parsedTables: ParsedTable[] = tables.map((t) =>
    ParsedTableSchema.parse(ddlByName.get(t)!.parsed),
  );
  const createTableSql = new Map(tables.map((t) => [t, ddlByName.get(t)!.rawSql]));

  const seedPlan = deriveSeedPlan(parsedTables, shape, { scale: opts.scale ?? DEFAULT_SCALE });
  const modes = applicableModes(shape);
  const seed = hashSeed(query, ...tables.map((t) => ddlByName.get(t)!.rawSql));

  let modeResults;
  try {
    modeResults = await runModes({ createTableSql, seedPlan, query, modes, seed });
  } catch (err) {
    if (err instanceof QueryExecutionError) throw new AnalyzeValidationError(err.message);
    throw err;
  }
  const worstMode = pickWorstMode(modeResults);

  const run = await prisma.analysisRun.create({
    data: {
      sessionId,
      query,
      schemaSnapshot: parsedTables as unknown as Prisma.InputJsonValue,
      worstMode,
      results: modeResults as unknown as Prisma.InputJsonValue,
    },
  });

  return AnalyzeResultSchema.parse({
    runId: run.id,
    query,
    schemaSnapshot: parsedTables,
    worstMode,
    modes: modeResults,
  });
}

/** Read back a stored run (GET /api/analyze/{runId}); null if not found. */
export async function getAnalysisRun(runId: string): Promise<AnalyzeResult | null> {
  const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  return AnalyzeResultSchema.parse({
    runId: run.id,
    query: run.query,
    schemaSnapshot: run.schemaSnapshot,
    worstMode: run.worstMode,
    modes: run.results,
  });
}

/** Worst plan by planner Total Cost; Execution Time breaks ties. */
export function pickWorstMode(results: ModeResult[]): ModeName {
  return results.reduce((worst, r) => {
    if (r.metrics.rootTotalCost > worst.metrics.rootTotalCost) return r;
    if (
      r.metrics.rootTotalCost === worst.metrics.rootTotalCost &&
      r.metrics.executionTimeMs > worst.metrics.executionTimeMs
    ) {
      return r;
    }
    return worst;
  }).mode;
}

import { randomUUID } from 'node:crypto';
import { PgDb, quoteIdent } from './pg-db';
import { MODES, generateRows, makeRng, hashSeed, domains, type ColumnSpec } from './seeder';
import type { ModeName } from './modes';
import type { ColumnPlan, SeedPlan, TablePlan } from './plan';
import type { ModeFlag, ModeMetrics, ModeResult } from '@/lib/analyze/analyze-result';

export interface RunModesParams {
  /** table name -> raw CREATE TABLE blob (executed to build the schema). */
  createTableSql: Map<string, string>;
  seedPlan: SeedPlan;
  query: string;
  modes: ModeName[];
  seed: number;
}

/** The user's query failed to EXPLAIN (bad column/syntax/etc.) — a client error
 *  the caller should surface as a 400, not a 500. */
export class QueryExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

/**
 * Run the query under each mode against a throwaway `s_<token>` schema: build
 * the tables, then per mode reseed every table, ANALYZE, and EXPLAIN ANALYZE.
 * Drops the schema in a finally. Returns one ModeResult per mode.
 */
export async function runModes(params: RunModesParams): Promise<ModeResult[]> {
  const { createTableSql, seedPlan, query, modes, seed } = params;
  const schema = `s_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const db = await PgDb.connect();

  try {
    await db.createSchema(schema);
    for (const tp of seedPlan.tables) {
      const sql = createTableSql.get(tp.table);
      if (sql) await db.exec(sql); // FK-topo order → references resolve
    }
    const allTables = seedPlan.tables.map((t) => quoteIdent(t.table)).join(', ');

    const results: ModeResult[] = [];
    for (const mode of modes) {
      if (allTables) await db.exec(`TRUNCATE ${allTables} CASCADE`);
      results.push(await runOneMode(db, mode, seedPlan, query, seed));
    }
    return results;
  } finally {
    await db.dropSchema(schema).catch(() => {});
    await db.close();
  }
}

async function runOneMode(
  db: PgDb,
  mode: ModeName,
  seedPlan: SeedPlan,
  query: string,
  seed: number,
): Promise<ModeResult> {
  const pkPools = new Map<string, unknown[]>();
  const rowCounts: Record<string, number> = {};

  for (const tp of seedPlan.tables) {
    const specs = materialize(tp, pkPools);
    const rng = makeRng(hashSeed(seed, tp.table, mode)); // independent stream per (table, mode)
    const rows = generateRows(specs, tp.rowCount, MODES[mode], tp.ctx, rng);
    await db.bulkLoad(
      tp.table,
      specs.map((s) => s.name),
      rows,
    );
    await db.exec(`ANALYZE ${quoteIdent(tp.table)}`);
    rowCounts[tp.table] = rows.length;

    if (tp.primaryKey) {
      const idx = specs.findIndex((s) => s.name === tp.primaryKey);
      if (idx >= 0)
        pkPools.set(
          tp.table,
          rows.map((r) => r[idx]),
        );
    }
  }

  const plan = await explain(db, query);
  return { mode, rowCounts, plan, metrics: metricsFromPlan(plan), flags: detectFlags(plan) };
}

// --- ColumnPlan -> seeder ColumnSpec ---------------------------------------

function materialize(tp: TablePlan, pkPools: Map<string, unknown[]>): ColumnSpec[] {
  return tp.columns.map((cp) => ({
    name: cp.name,
    domain: domainFor(cp, pkPools),
    dist: { cardinality: cp.cardinality, skew: cp.skew, nullFraction: cp.nullFraction },
    role: cp.role,
    unique: cp.isPrimaryKey,
  }));
}

function domainFor(cp: ColumnPlan, pkPools: Map<string, unknown[]>): ColumnSpec['domain'] {
  if (cp.fk) {
    const pool = pkPools.get(cp.fk.refTable);
    return domains.fromPool(pool && pool.length ? pool : [1]);
  }
  const base = baseDomain(cp);
  if (cp.isPrimaryKey || !cp.injectValues?.length) return base;
  return withInjected(base, cp.injectValues);
}

function baseDomain(cp: ColumnPlan): ColumnSpec['domain'] {
  const t = cp.pgType.toLowerCase();
  if (/uuid/.test(t)) return domains.uuid();
  if (/timestamp|date|time/.test(t)) return domains.timestamp();
  if (/bool/.test(t)) return domains.bool();
  if (/serial|int/.test(t)) return domains.int(1);
  if (/numeric|decimal|real|double|float/.test(t)) return domains.numeric();
  return domains.text(`${cp.name}_`);
}

/** Put injected literals at the head of the domain (index 0 → high_skew's
 *  zipfian makes the queried value the hot one), then fill with base values. */
function withInjected(base: ColumnSpec['domain'], injected: unknown[]): ColumnSpec['domain'] {
  return (dist, ctx) => {
    const fill = base(
      { ...dist, cardinality: Math.max(1, dist.cardinality - injected.length) },
      ctx,
    );
    const rest = fill.filter((v) => !injected.some((iv) => sameValue(iv, v)));
    return [...injected, ...rest].slice(0, Math.max(injected.length, dist.cardinality));
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

// --- EXPLAIN plan parsing --------------------------------------------------

interface PgPlanNode {
  'Node Type'?: string;
  'Relation Name'?: string;
  'Startup Cost'?: number;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  'Actual Rows'?: number;
  'Sort Method'?: string;
  Plans?: PgPlanNode[];
}
interface PgPlanRoot {
  Plan?: PgPlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

async function explain(db: PgDb, query: string): Promise<unknown> {
  try {
    const rows = await db.query<{ 'QUERY PLAN': unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${query}`,
    );
    return rows[0]?.['QUERY PLAN'];
  } catch (err) {
    // Running the user's query failed (missing column, syntax, type mismatch).
    throw new QueryExecutionError(err instanceof Error ? err.message : 'Query failed to execute');
  }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

function metricsFromPlan(plan: unknown): ModeMetrics {
  // pg returns EXPLAIN FORMAT JSON as a parsed array; narrow at this boundary.
  const root = (plan as PgPlanRoot[] | undefined)?.[0];
  const node = root?.Plan ?? {};
  return {
    planningTimeMs: num(root?.['Planning Time']),
    executionTimeMs: num(root?.['Execution Time']),
    rootStartupCost: num(node['Startup Cost']),
    rootTotalCost: num(node['Total Cost']),
    estimatedRows: num(node['Plan Rows']),
    actualRows: num(node['Actual Rows']),
  };
}

/** A small starter set of measured-fact detectors. Grows over time. */
function detectFlags(plan: unknown): ModeFlag[] {
  const root = (plan as PgPlanRoot[] | undefined)?.[0]?.Plan;
  if (!root) return [];

  const flags: ModeFlag[] = [];
  const visit = (node: PgPlanNode) => {
    const type = node['Node Type'];
    if (type === 'Seq Scan') {
      flags.push({
        code: 'seq_scan',
        detail: { relation: node['Relation Name'], actualRows: num(node['Actual Rows']) },
      });
    }
    if (type === 'Sort' && node['Sort Method']?.includes('external')) {
      flags.push({ code: 'sort_spilled_to_disk', detail: { method: node['Sort Method'] } });
    }
    const planRows = node['Plan Rows'];
    const actualRows = node['Actual Rows'];
    if (
      typeof planRows === 'number' &&
      typeof actualRows === 'number' &&
      planRows > 0 &&
      actualRows > 0
    ) {
      const ratio = Math.max(planRows / actualRows, actualRows / planRows);
      if (ratio >= 10) {
        flags.push({ code: 'rows_misestimated', detail: { planRows, actualRows, node: type } });
      }
    }
    for (const child of node.Plans ?? []) visit(child);
  };
  visit(root);
  return flags;
}

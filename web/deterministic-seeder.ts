/**
 * deterministic-seeder.ts — broad-strokes sketch
 *
 * Query-driven, fully deterministic table seeding. No LLM anywhere.
 *
 * The planner reads pg_stats (cardinality, skew, null fraction, physical
 * correlation) — never your data's *meaning*. So every knob here is numeric,
 * which is exactly why this can be mechanical and reproducible.
 *
 * Pipeline:  parsed query → SeedPlan → (per mode) generate rows → order rows
 *            → COPY load → ANALYZE.
 *
 * Status: reference sketch. Moves into web/src/lib/engine/ at /analyze
 * implementation time. SeedPlan derivation and multi-table (join) orchestration
 * are the parts still to build — see notes below.
 */

// ----------------------------------------------------------------------------
// 0. DB boundary (driver-agnostic). In practice back this with node-postgres
//    (pg@8.21) and load via COPY ... FROM STDIN — INSERT-per-row is far too
//    slow at 10k+ rows. Kept abstract so the engine isn't tied to a driver.
// ----------------------------------------------------------------------------
export interface Db {
  /** Bulk-load rows into a table. Implement with COPY for speed. */
  bulkLoad(table: string, columns: string[], rows: unknown[][]): Promise<void>;
  /** Run a no-result statement (ANALYZE, TRUNCATE, CREATE SCHEMA, ...). */
  exec(sql: string): Promise<void>;
}

// ----------------------------------------------------------------------------
// 1. Deterministic RNG (mulberry32). Same seed ⇒ identical data, so a given
//    (schema, query, mode) is reproducible and cacheable. The real seed is
//    derived from a hash of (schemaSnapshot, query) — see ARCHITECTURE.md.
// ----------------------------------------------------------------------------
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// 2. The knobs the planner actually responds to.
// ----------------------------------------------------------------------------
export type Skew = { kind: 'uniform' } | { kind: 'zipfian'; exponent: number }; // 0 = flat, ~1 = heavy head

export interface ColumnDist {
  cardinality: number; // distinct values   → n_distinct
  skew: Skew; // value frequencies  → MCV list + histogram
  nullFraction: number; // 0..1               → null_frac
}

/**
 * The role a column plays for THIS query — tagged by SeedPlan derivation and
 * used to target mode overlays. At most one column per table holds each role.
 *   ordered   → the range/sort axis (append_order, shuffled, skewed_range)
 *   skewValue → the value-frequency axis (high_skew)
 *   fanOutFk  → the join foreign key axis (fan_out)
 */
export type ColumnRole = 'ordered' | 'skewValue' | 'fanOutFk';

// A column to generate, plus how its distinct values are produced.
export interface ColumnSpec {
  name: string;
  /** Builds the ordered domain of `cardinality` distinct values. */
  domain: (dist: ColumnDist, ctx: QueryContext) => unknown[];
  dist: ColumnDist;
  /** The query role this column plays; drives correlation + mode overlays. */
  role?: ColumnRole;
}

// Constants pulled from the query by the parser (upstream of this file).
export interface QueryContext {
  /** Literal a predicate compares the ordered column against,
   *  e.g. WHERE created_at > '2026-01-01'. Used to position the domain. */
  rangeLiteral?: unknown;
}

// ----------------------------------------------------------------------------
// 3. Modes: presets that stress ONE axis the query is sensitive to. Same
//    columns, same cardinality — different stats shape. A mode is an OVERLAY on
//    the SeedPlan: table-level knobs (insertion order, range bias) plus an
//    optional skew override on the column carrying the mode's axis role.
// ----------------------------------------------------------------------------
export type ModeName = 'append_order' | 'shuffled' | 'skewed_range' | 'high_skew' | 'fan_out';

export interface Mode {
  name: ModeName;
  /** Physical correlation is set by INSERTION ORDER, not by values. */
  insertOrder: 'sorted' | 'shuffled';
  /** How to weight the ordered column's domain relative to the literal. */
  rangeBias: 'balanced' | 'mostlyAfter' | 'mostlyBefore';
  /** When set, override the sampler of the column whose role is `axisRole`
   *  with this skew — how high_skew and fan_out express themselves. */
  axisRole?: Exclude<ColumnRole, 'ordered'>; // 'skewValue' | 'fanOutFk'
  axisSkew?: Skew;
}

export const MODES: Record<ModeName, Mode> = {
  // production-like append-only table: index range scan is cheap (corr ≈ 1)
  append_order: { name: 'append_order', insertOrder: 'sorted', rangeBias: 'balanced' },
  // same values, churned physical order: range scan → random I/O (corr ≈ 0)
  shuffled: { name: 'shuffled', insertOrder: 'shuffled', rangeBias: 'balanced' },
  // most rows recent, few old: does LIMIT short-circuit? does the index pay?
  skewed_range: { name: 'skewed_range', insertOrder: 'sorted', rangeBias: 'mostlyAfter' },
  // value-frequency skew: hot keys / fat MCV list on the value axis
  high_skew: {
    name: 'high_skew',
    insertOrder: 'sorted',
    rangeBias: 'balanced',
    axisRole: 'skewValue',
    axisSkew: { kind: 'zipfian', exponent: 1.0 },
  },
  // join fan-out: one giant parent owns most children (zipfian on the FK)
  fan_out: {
    name: 'fan_out',
    insertOrder: 'sorted',
    rangeBias: 'balanced',
    axisRole: 'fanOutFk',
    axisSkew: { kind: 'zipfian', exponent: 1.1 },
  },
};

// ----------------------------------------------------------------------------
// 4. Samplers: map rng() → an index into the domain array.
// ----------------------------------------------------------------------------
function uniformSampler(n: number, rng: () => number): () => number {
  return () => Math.floor(rng() * n);
}

function zipfianSampler(n: number, exponent: number, rng: () => number): () => number {
  // Precompute cumulative weights wᵢ = 1 / (i+1)^exponent.
  const cum = new Array<number>(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / Math.pow(i + 1, exponent);
    cum[i] = acc;
  }
  const total = acc;
  return () => {
    const target = rng() * total;
    let lo = 0,
      hi = n - 1; // binary search the cumulative array
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

function samplerForSkew(n: number, skew: Skew, rng: () => number): () => number {
  return skew.kind === 'zipfian' ? zipfianSampler(n, skew.exponent, rng) : uniformSampler(n, rng);
}

// Bias the ordered column's domain selection around the literal split point.
function rangeBiasedSampler(
  n: number,
  splitIndex: number,
  bias: Mode['rangeBias'],
  rng: () => number,
): () => number {
  if (bias === 'balanced') return uniformSampler(n, rng);
  const heavy = 0.95; // 95% of rows land on the favored side of the literal
  return () => {
    const after = bias === 'mostlyAfter' ? rng() < heavy : rng() >= heavy;
    return after && splitIndex < n
      ? splitIndex + Math.floor(rng() * (n - splitIndex))
      : Math.floor(rng() * Math.max(1, splitIndex));
  };
}

// ----------------------------------------------------------------------------
// 5. Generate one mode's rows, then order them for the target correlation.
// ----------------------------------------------------------------------------
export function generateRows(
  columns: ColumnSpec[],
  rowCount: number,
  mode: Mode,
  ctx: QueryContext,
  rng: () => number,
): unknown[][] {
  // Build each column's value domain + its sampler.
  const built = columns.map((col) => {
    const domain = col.domain(col.dist, ctx);
    let sample: () => number;
    if (col.role === 'ordered') {
      const split = splitIndexFor(domain, ctx.rangeLiteral);
      sample = rangeBiasedSampler(domain.length, split, mode.rangeBias, rng);
    } else if (mode.axisSkew && mode.axisRole === col.role) {
      sample = samplerForSkew(domain.length, mode.axisSkew, rng); // mode overlay
    } else {
      sample = samplerForSkew(domain.length, col.dist.skew, rng); // base distribution
    }
    return { col, domain, sample };
  });

  const rows: unknown[][] = [];
  for (let r = 0; r < rowCount; r++) {
    rows.push(
      built.map(({ col, domain, sample }) =>
        rng() < col.dist.nullFraction ? null : domain[sample()],
      ),
    );
  }

  // Physical correlation = insertion order. Sort or shuffle by the ordered col.
  const orderedIdx = columns.findIndex((c) => c.role === 'ordered');
  if (orderedIdx >= 0) {
    if (mode.insertOrder === 'sorted') {
      rows.sort((a, b) => cmp(a[orderedIdx], b[orderedIdx])); // corr → 1
    } else {
      fisherYates(rows, rng); // corr → 0
    }
  }
  return rows;
}

// ----------------------------------------------------------------------------
// 6. SeedPlan: the layer between the parser and this kernel. Derived
//    deterministically from (ParsedTable[], parsed query) — NOT in this file
//    yet; this is the interface the /analyze engine will populate.
//
//    Tables are ordered parents-before-children (FK-topological) so a child's
//    `fanOutFk` column can sample its parent's already-generated key pool. That
//    cross-table key-pool wiring is the multi-table orchestration still TODO.
// ----------------------------------------------------------------------------
export interface TablePlan {
  table: string;
  rowCount: number;
  columns: ColumnSpec[];
  ctx: QueryContext;
}

export interface SeedPlan {
  /** FK-topological order: parents before children. */
  tables: TablePlan[];
}

// ----------------------------------------------------------------------------
// 7. Orchestration: seed one table for one mode end-to-end. ANALYZE is
//    mandatory — without it the planner never sees the distribution we built.
// ----------------------------------------------------------------------------
export async function seedMode(db: Db, plan: TablePlan, mode: Mode, seed = 42): Promise<void> {
  const rng = makeRng(seed);
  const rows = generateRows(plan.columns, plan.rowCount, mode, plan.ctx, rng);
  await db.exec(`TRUNCATE ${plan.table}`); // reset between modes
  await db.bulkLoad(
    plan.table,
    plan.columns.map((c) => c.name),
    rows,
  ); // COPY under the hood
  await db.exec(`ANALYZE ${plan.table}`); // refresh pg_stats
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
function splitIndexFor(domain: unknown[], literal: unknown): number {
  if (literal === undefined) return Math.floor(domain.length / 2);
  const i = domain.findIndex((v) => cmp(v, literal) >= 0);
  return i < 0 ? domain.length : i;
}
function cmp(a: unknown, b: unknown): number {
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
function fisherYates<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ----------------------------------------------------------------------------
// Example domain builders — the ONLY type-aware part. Extend per pg type:
// uuid, text, enum, bool, numeric, etc.
// ----------------------------------------------------------------------------
export const domains = {
  /** Evenly spaced timestamps over a window that straddles the literal. */
  timestamp(windowDays = 365): ColumnSpec['domain'] {
    return (dist, ctx) => {
      const anchor = ctx.rangeLiteral instanceof Date ? ctx.rangeLiteral : new Date();
      const end = anchor.getTime() + (windowDays / 2) * 864e5;
      const start = end - windowDays * 864e5;
      const step = (end - start) / Math.max(1, dist.cardinality - 1);
      return Array.from({ length: dist.cardinality }, (_, i) => new Date(start + i * step));
    };
  },
  /** Sequential integers (e.g. a status-code set or an id pool). */
  int(base = 1): ColumnSpec['domain'] {
    return (dist) => Array.from({ length: dist.cardinality }, (_, i) => base + i);
  },
  /** Foreign keys: sample from an existing parent-key pool. Fan-out is then
   *  controlled by cardinality + skew (few parents, zipfian → realistic
   *  "one giant customer with most of the orders" hotspots). */
  foreignKey(parentKeys: unknown[]): ColumnSpec['domain'] {
    return (dist) => parentKeys.slice(0, dist.cardinality);
  },
};

// ----------------------------------------------------------------------------
// Usage (the parser produces a SeedPlan; the runner loops modes per table):
//
//   const plan: TablePlan = {
//     table: "orders",
//     rowCount: 100_000,
//     ctx: { rangeLiteral: new Date("2026-01-01") },
//     columns: [
//       { name: "id",          domain: domains.int(1),            dist: { cardinality: 100_000, skew: { kind: "uniform" }, nullFraction: 0 } },
//       { name: "customer_id", domain: domains.foreignKey(custIds), dist: { cardinality: 5_000, skew: { kind: "zipfian", exponent: 1.1 }, nullFraction: 0 }, role: "fanOutFk" },
//       { name: "created_at",  domain: domains.timestamp(365),    dist: { cardinality: 50_000, skew: { kind: "uniform" }, nullFraction: 0 }, role: "ordered" },
//     ],
//   };
//
//   for (const mode of Object.values(MODES)) {
//     await seedMode(db, plan, mode);
//     // ...then run EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) and record the plan per mode.
//   }
// ----------------------------------------------------------------------------

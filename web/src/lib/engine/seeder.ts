import type { ModeName } from './modes';

/**
 * Deterministic, query-driven row generation. No LLM. The planner reads pg_stats
 * (cardinality, skew, null fraction, physical correlation) — never the data's
 * meaning — so every knob here is numeric, which is what makes it reproducible.
 * See ARCHITECTURE.md ("Engine: seeding model").
 */

// --- Deterministic RNG (mulberry32): same seed ⇒ identical data --------------
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash → RNG seed. Lets each (table, mode) get an independent
 *  stream so parent and child tables never line up by row index. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

// --- The knobs the planner responds to ---------------------------------------
export type Skew = { kind: 'uniform' } | { kind: 'zipfian'; exponent: number };

export interface ColumnDist {
  cardinality: number; // distinct values   → n_distinct
  skew: Skew; // value frequencies  → MCV list + histogram
  nullFraction: number; // 0..1            → null_frac
}

/**
 * The role a column plays for the query — targets mode overlays.
 *   ordered   → range/sort axis (append_order, shuffled, skewed_range)
 *   skewValue → value-frequency axis (high_skew)
 *   fanOutFk  → join foreign-key axis (fan_out)
 */
export type ColumnRole = 'ordered' | 'skewValue' | 'fanOutFk';

export interface ColumnSpec {
  name: string;
  /** Builds the ordered domain of `cardinality` distinct values. */
  domain: (dist: ColumnDist, ctx: QueryContext) => unknown[];
  dist: ColumnDist;
  role?: ColumnRole;
  /** Primary keys: assign distinct values sequentially instead of sampling
   *  (sampling draws with replacement and would violate the PK). */
  unique?: boolean;
}

export interface QueryContext {
  /** Literal a predicate compares the ordered column against; positions the domain. */
  rangeLiteral?: unknown;
}

// --- Modes as overlays on a column plan --------------------------------------
export interface Mode {
  name: ModeName;
  insertOrder: 'sorted' | 'shuffled';
  rangeBias: 'balanced' | 'mostlyAfter' | 'mostlyBefore';
  /** Override the sampler of the column with this role (high_skew, fan_out). */
  axisRole?: Exclude<ColumnRole, 'ordered'>;
  axisSkew?: Skew;
}

export const MODES: Record<ModeName, Mode> = {
  append_order: { name: 'append_order', insertOrder: 'sorted', rangeBias: 'balanced' },
  shuffled: { name: 'shuffled', insertOrder: 'shuffled', rangeBias: 'balanced' },
  skewed_range: { name: 'skewed_range', insertOrder: 'sorted', rangeBias: 'mostlyAfter' },
  high_skew: {
    name: 'high_skew',
    insertOrder: 'sorted',
    rangeBias: 'balanced',
    axisRole: 'skewValue',
    axisSkew: { kind: 'zipfian', exponent: 1.0 },
  },
  fan_out: {
    name: 'fan_out',
    insertOrder: 'sorted',
    rangeBias: 'balanced',
    axisRole: 'fanOutFk',
    axisSkew: { kind: 'zipfian', exponent: 1.1 },
  },
};

// --- Samplers: rng() → index into the domain array ---------------------------
function uniformSampler(n: number, rng: () => number): () => number {
  return () => Math.floor(rng() * n);
}

function zipfianSampler(n: number, exponent: number, rng: () => number): () => number {
  const cum = new Array<number>(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / Math.pow(i + 1, exponent);
    cum[i] = acc;
  }
  const total = acc;
  return () => {
    const target = rng() * total;
    let lo = 0;
    let hi = n - 1;
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

function rangeBiasedSampler(
  n: number,
  splitIndex: number,
  bias: Mode['rangeBias'],
  rng: () => number,
): () => number {
  if (bias === 'balanced') return uniformSampler(n, rng);
  const heavy = 0.95; // 95% of rows on the favored side of the literal
  return () => {
    const after = bias === 'mostlyAfter' ? rng() < heavy : rng() >= heavy;
    return after && splitIndex < n
      ? splitIndex + Math.floor(rng() * (n - splitIndex))
      : Math.floor(rng() * Math.max(1, splitIndex));
  };
}

// --- Generate one mode's rows, ordered for the target correlation ------------
export function generateRows(
  columns: ColumnSpec[],
  rowCount: number,
  mode: Mode,
  ctx: QueryContext,
  rng: () => number,
): unknown[][] {
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
      built.map(({ col, domain, sample }) => {
        if (col.unique) return domain[r % domain.length]; // distinct, sequential
        return rng() < col.dist.nullFraction ? null : domain[sample()];
      }),
    );
  }

  // Physical correlation = insertion order, set by the ordered column only.
  // FK and value columns were sampled independently per row, so sorting here
  // never aligns them with position (no "too perfect" parent/child matchup).
  const orderedIdx = columns.findIndex((c) => c.role === 'ordered');
  if (orderedIdx >= 0) {
    if (mode.insertOrder === 'sorted') rows.sort((a, b) => cmp(a[orderedIdx], b[orderedIdx]));
    else fisherYates(rows, rng);
  }
  return rows;
}

// --- Domain builders (the only type-aware part) ------------------------------
export const domains = {
  /** Evenly spaced timestamps over a window straddling the literal. */
  timestamp(windowDays = 365): ColumnSpec['domain'] {
    return (dist, ctx) => {
      const anchor = ctx.rangeLiteral instanceof Date ? ctx.rangeLiteral : new Date(0);
      const end = anchor.getTime() + (windowDays / 2) * 864e5;
      const start = end - windowDays * 864e5;
      const step = (end - start) / Math.max(1, dist.cardinality - 1);
      return Array.from({ length: dist.cardinality }, (_, i) => new Date(start + i * step));
    };
  },
  /** Sequential integers (ids, status codes). */
  int(base = 1): ColumnSpec['domain'] {
    return (dist) => Array.from({ length: dist.cardinality }, (_, i) => base + i);
  },
  /** Evenly spaced decimals. */
  numeric(min = 0, max = 1000): ColumnSpec['domain'] {
    return (dist) => {
      const step = (max - min) / Math.max(1, dist.cardinality - 1);
      return Array.from({ length: dist.cardinality }, (_, i) => +(min + i * step).toFixed(2));
    };
  },
  /** Evenly spaced numbers centered on a literal, so a range predicate
   *  (`> L`, `BETWEEN`) matches ~half the rows. `integer` rounds for int types.
   *  Half-width is at least the cardinality, keeping rounded ints distinct. */
  straddle(center: number, integer = false): ColumnSpec['domain'] {
    return (dist) => {
      const card = Math.max(2, dist.cardinality);
      const half = Math.max(Math.abs(center), card);
      const start = center - half;
      const step = (2 * half) / (card - 1);
      return Array.from({ length: card }, (_, i) => {
        const v = start + i * step;
        return integer ? Math.round(v) : +v.toFixed(2);
      });
    };
  },
  /** Distinct short strings, e.g. `v0`, `v1`, … */
  text(prefix = 'v'): ColumnSpec['domain'] {
    return (dist) => Array.from({ length: dist.cardinality }, (_, i) => `${prefix}${i}`);
  },
  /** Booleans. */
  bool(): ColumnSpec['domain'] {
    return (dist) => Array.from({ length: Math.min(2, dist.cardinality) }, (_, i) => i === 0);
  },
  /** Valid, distinct UUID strings (deterministic, not random). */
  uuid(): ColumnSpec['domain'] {
    return (dist) =>
      Array.from(
        { length: dist.cardinality },
        (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      );
  },
  /** Sample from an existing parent-key pool (foreign keys). Fan-out is then
   *  controlled by cardinality + skew on the FK column. */
  fromPool(pool: unknown[]): ColumnSpec['domain'] {
    return (dist) => pool.slice(0, Math.max(1, Math.min(dist.cardinality, pool.length)));
  },
};

// --- helpers -----------------------------------------------------------------
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

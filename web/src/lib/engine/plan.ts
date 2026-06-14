import type { ColumnRole, QueryContext, Skew } from './seeder';

/** A scalar predicate literal, typed per the column's pgType (see `typedLiteral`). */
export type Literal = string | number | Date;

/**
 * What kind of column this is, as a discriminated union so "PK xor FK xor plain
 * value" is enforced at compile time (and FK refs / injected literals only exist
 * where they're meaningful).
 */
export type ColumnKind =
  | { tag: 'pk' }
  | { tag: 'fk'; refTable: string; refColumn: string }
  | { tag: 'value'; injectValues?: Literal[] };

/**
 * Declarative generation recipe produced by `deriveSeedPlan` and materialized
 * into seeder `ColumnSpec`s by the executor (which resolves a domain builder
 * from `pgType` and, for FK columns, injects the parent's key pool).
 */
export interface ColumnPlan {
  name: string;
  pgType: string;
  /** Query axis this column plays (orthogonal to `kind`; a PK may be the ordered axis). */
  role?: ColumnRole;
  cardinality: number;
  skew: Skew;
  nullFraction: number;
  kind: ColumnKind;
  /**
   * Typed literal this value column is range-compared against (`> 500000`,
   * `BETWEEN`), independent of whether it's the ordered axis. When set, the
   * column's domain is centered on it so the predicate actually matches rows.
   * Only meaningful for `value` columns (PKs/FKs derive their values elsewhere).
   */
  rangeLiteral?: Literal;
}

export interface TablePlan {
  table: string;
  rowCount: number;
  columns: ColumnPlan[];
  ctx: QueryContext;
  /** Single-column PK name, if any — its generated values form the FK pool for children. */
  primaryKey?: string;
}

export interface SeedPlan {
  /** FK-topological order: parents (referenced tables) before children. */
  tables: TablePlan[];
}

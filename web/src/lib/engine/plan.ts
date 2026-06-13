import type { ColumnRole, QueryContext, Skew } from './seeder';

/**
 * Declarative generation recipe produced by `deriveSeedPlan` and materialized
 * into seeder `ColumnSpec`s by the executor (which resolves a domain builder
 * from `pgType` and, for FK columns, injects the parent's key pool).
 */
export interface ColumnPlan {
  name: string;
  pgType: string;
  role?: ColumnRole;
  cardinality: number;
  skew: Skew;
  nullFraction: number;
  /** Set when this column is a single-column foreign key. */
  fk?: { refTable: string; refColumn: string };
  isPrimaryKey?: boolean;
  /** Typed literals from `col = <literal>` predicates, injected into the domain
   *  so the predicate actually matches rows (head position → high_skew hot value). */
  injectValues?: unknown[];
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

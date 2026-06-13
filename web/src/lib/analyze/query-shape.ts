/**
 * The query-driven inputs the SeedPlan needs: which tables are touched, how
 * they join, and the columns the query is sensitive to (filters, ORDER BY,
 * GROUP BY). Extracted from a SELECT by `parseQuery` (libpg-query) — see
 * ARCHITECTURE.md. Column references are resolved to their real table name.
 */
export type CompareOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

export interface QueryColumnRef {
  table: string;
  column: string;
}

export interface QueryFilter extends QueryColumnRef {
  op: CompareOp;
  /** Literal as written (e.g. `'2026-01-01'`, `42`); interpreted per column type later. */
  literal: string;
}

export interface QueryJoin {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

export interface QueryOrderBy extends QueryColumnRef {
  direction: 'asc' | 'desc';
}

export interface QueryShape {
  tables: string[];
  joins: QueryJoin[];
  /** Comparison predicates. `BETWEEN` expands to `>=` + `<=`; `IN (...)` expands
   *  to one `=` per list element. */
  filters: QueryFilter[];
  /** Columns tested with `IS NULL` — seeded with a non-zero null fraction. */
  nullTests: QueryColumnRef[];
  orderBy: QueryOrderBy[];
  groupBy: QueryColumnRef[];
}

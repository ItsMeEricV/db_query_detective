import type { ParsedTable } from '@/lib/ddl/parsed-table';
import type { ColumnKind, ColumnPlan, Literal, SeedPlan, TablePlan } from '@/lib/engine/plan';
import type { ColumnRole } from '@/lib/engine/seeder';
import type { QueryShape } from './query-shape';

const PARENT_RATIO = 10; // parents get ~1/10 the child scale
const MIN_PARENT_ROWS = 50;
const SKEW_VALUE_CARDINALITY = 20;
const OTHER_CARDINALITY_FRACTION = 0.1;
const NULL_FRACTION = 0.3; // for columns tested with IS NULL
const RANGE_OPS = new Set(['<', '<=', '>', '>=']);

export interface DeriveOptions {
  scale: number;
}

/**
 * Turn the parsed schema + query shape into a {@link SeedPlan}: per-table
 * column recipes (cardinalities, axis roles, FK refs), FK-topological order,
 * and parent-aware row counts. Pure and deterministic. See ARCHITECTURE.md.
 */
export function deriveSeedPlan(
  parsedTables: ParsedTable[],
  shape: QueryShape,
  opts: DeriveOptions,
): SeedPlan {
  const byName = new Map(parsedTables.map((t) => [t.table, t]));
  // Plan every table the caller passes — this is the FK closure of the query's
  // tables, so FK-referenced parents exist when the schema is built. The query
  // shape only drives axis roles; closure-added parents just get seeded.
  const referenced = [...byName.keys()];

  const isParent = new Set<string>();
  for (const table of referenced) {
    for (const fk of byName.get(table)!.foreignKeys) {
      if (referenced.includes(fk.refTable)) isParent.add(fk.refTable);
    }
  }
  const rowCountFor = (table: string) =>
    isParent.has(table)
      ? Math.max(MIN_PARENT_ROWS, Math.round(opts.scale / PARENT_RATIO))
      : opts.scale;

  const tables = topoSort(referenced, byName).map((table) =>
    buildTablePlan(byName.get(table)!, shape, rowCountFor),
  );
  return { tables };
}

function buildTablePlan(
  pt: ParsedTable,
  shape: QueryShape,
  rowCountFor: (table: string) => number,
): TablePlan {
  const rowCount = rowCountFor(pt.table);
  const pk = pt.primaryKey.length === 1 ? pt.primaryKey[0] : undefined;

  const fanOutFk = pickFanOutFk(pt, shape);
  // No explicit ordered axis → fall back to the single-column PK, so append_order
  // (sorted by PK) and shuffled (random) still differ for axis-less queries.
  const orderedAxis = pickOrderedAxis(pt.table, shape) ?? (pk && pk !== fanOutFk ? pk : undefined);
  const skewValue = pickSkewValue(pt.table, shape, orderedAxis, fanOutFk);

  // Literals from `col = <literal>` predicates, so those predicates match rows.
  const eqLiterals = new Map<string, string[]>();
  for (const f of shape.filters) {
    if (f.table === pt.table && f.op === '=') {
      eqLiterals.set(f.column, [...(eqLiterals.get(f.column) ?? []), f.literal]);
    }
  }
  // Columns tested with IS NULL → seed some nulls so the predicate matches.
  const nullCols = new Set(
    shape.nullTests.filter((n) => n.table === pt.table).map((n) => n.column),
  );

  const columns: ColumnPlan[] = pt.columns.map((col) => {
    const fk = pt.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === col.name);
    const isPrimaryKey = pk === col.name;

    let role: ColumnRole | undefined;
    if (col.name === fanOutFk) role = 'fanOutFk';
    else if (col.name === orderedAxis) role = 'ordered';
    else if (col.name === skewValue) role = 'skewValue';

    let kind: ColumnKind;
    let rangeLiteral: Literal | undefined;
    if (isPrimaryKey) {
      kind = { tag: 'pk' };
    } else if (fk) {
      kind = { tag: 'fk', refTable: fk.refTable, refColumn: fk.refColumns[0] ?? 'id' };
    } else {
      const injectValues = (eqLiterals.get(col.name) ?? []).map((l) => typedLiteral(col.pgType, l));
      kind = injectValues.length ? { tag: 'value', injectValues } : { tag: 'value' };
      // A range predicate on a value column positions its domain so the
      // predicate matches — even when a different column is the ordered axis.
      rangeLiteral = rangeLiteralForColumn(pt.table, col.name, col.pgType, shape);
    }

    return {
      name: col.name,
      pgType: col.pgType,
      role,
      cardinality: cardinalityFor(col.pgType, { isPrimaryKey, fk, role }, rowCount, rowCountFor),
      skew: { kind: 'uniform' },
      nullFraction: !isPrimaryKey && nullCols.has(col.name) ? NULL_FRACTION : 0,
      kind,
      ...(rangeLiteral !== undefined ? { rangeLiteral } : {}),
    };
  });

  return {
    table: pt.table,
    rowCount,
    columns,
    ctx: { rangeLiteral: rangeLiteralFor(pt, orderedAxis, shape) },
    ...(pk ? { primaryKey: pk } : {}),
  };
}

function cardinalityFor(
  pgType: string,
  attrs: { isPrimaryKey: boolean; fk?: ParsedTable['foreignKeys'][number]; role?: ColumnRole },
  rowCount: number,
  rowCountFor: (table: string) => number,
): number {
  if (attrs.isPrimaryKey) return rowCount; // every row distinct
  if (attrs.fk) return rowCountFor(attrs.fk.refTable); // pool = parent keys
  if (attrs.role === 'ordered') return rowCount; // many distinct values to range over
  if (attrs.role === 'skewValue') return Math.min(rowCount, SKEW_VALUE_CARDINALITY);
  if (/bool/i.test(pgType)) return 2;
  return Math.max(2, Math.round(rowCount * OTHER_CARDINALITY_FRACTION));
}

// --- axis selection --------------------------------------------------------

function pickOrderedAxis(table: string, shape: QueryShape): string | undefined {
  const ob = shape.orderBy.find((o) => o.table === table);
  if (ob) return ob.column;
  return shape.filters.find((f) => f.table === table && RANGE_OPS.has(f.op))?.column;
}

function pickFanOutFk(pt: ParsedTable, shape: QueryShape): string | undefined {
  for (const fk of pt.foreignKeys) {
    if (fk.columns.length !== 1) continue;
    const col = fk.columns[0];
    const joined = shape.joins.some(
      (j) =>
        (j.leftTable === pt.table && j.leftColumn === col) ||
        (j.rightTable === pt.table && j.rightColumn === col),
    );
    if (joined) return col;
  }
  return undefined;
}

function pickSkewValue(
  table: string,
  shape: QueryShape,
  orderedAxis: string | undefined,
  fanOutFk: string | undefined,
): string | undefined {
  const free = (col: string) => col !== orderedAxis && col !== fanOutFk;
  const eq = shape.filters.find(
    (f) => f.table === table && (f.op === '=' || f.op === '<>') && free(f.column),
  );
  if (eq) return eq.column;
  return shape.groupBy.find((g) => g.table === table && free(g.column))?.column;
}

function rangeLiteralFor(
  pt: ParsedTable,
  orderedAxis: string | undefined,
  shape: QueryShape,
): unknown {
  if (!orderedAxis) return undefined;
  const f = shape.filters.find(
    (x) => x.table === pt.table && x.column === orderedAxis && RANGE_OPS.has(x.op),
  );
  if (!f) return undefined;
  const pgType = pt.columns.find((c) => c.name === orderedAxis)?.pgType ?? '';
  return typedLiteral(pgType, f.literal);
}

/** The typed literal a value column is range-compared against, centered so a
 *  single bound (`> L`) or a `BETWEEN a AND b` both land inside the domain. */
function rangeLiteralForColumn(
  table: string,
  column: string,
  pgType: string,
  shape: QueryShape,
): Literal | undefined {
  const lits = shape.filters
    .filter((f) => f.table === table && f.column === column && RANGE_OPS.has(f.op))
    .map((f) => typedLiteral(pgType, f.literal));
  if (lits.length === 0) return undefined;
  return centerLiteral(lits);
}

function centerLiteral(lits: Literal[]): Literal {
  if (lits.every((l) => typeof l === 'number')) {
    const ns = lits as number[];
    return (Math.min(...ns) + Math.max(...ns)) / 2;
  }
  if (lits.every((l) => l instanceof Date)) {
    const ms = (lits as Date[]).map((d) => d.getTime());
    return new Date((Math.min(...ms) + Math.max(...ms)) / 2);
  }
  return lits[0];
}

function typedLiteral(pgType: string, literal: string): Literal {
  if (/timestamp|date|time/i.test(pgType)) {
    const d = new Date(literal);
    return Number.isNaN(d.getTime()) ? literal : d;
  }
  if (/int|serial|numeric|decimal|real|double|float/i.test(pgType)) {
    const n = Number(literal);
    return Number.isNaN(n) ? literal : n;
  }
  return literal;
}

// --- FK-topological order (parents before children) ------------------------

function topoSort(referenced: string[], byName: Map<string, ParsedTable>): string[] {
  const result: string[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (table: string) => {
    if (done.has(table) || onStack.has(table)) return;
    onStack.add(table);
    for (const fk of byName.get(table)?.foreignKeys ?? []) {
      if (fk.refTable !== table && referenced.includes(fk.refTable)) visit(fk.refTable);
    }
    onStack.delete(table);
    done.add(table);
    result.push(table); // pushed after its parents → parents come first
  };

  for (const table of referenced) visit(table);
  return result;
}

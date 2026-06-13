import { parse } from 'libpg-query';
import type { ParseResult, Node, SelectStmt, RangeVar, A_Expr } from '@pgsql/types';
import type {
  CompareOp,
  QueryColumnRef,
  QueryFilter,
  QueryJoin,
  QueryOrderBy,
  QueryShape,
} from './query-shape';

const COMPARE_OPS = new Set<string>(['=', '<>', '<', '<=', '>', '>=']);

/**
 * Parse a SELECT into a {@link QueryShape} using libpg-query (PG17). v1 supports
 * single-table queries and simple equi-joins; column refs are resolved to their
 * real table name (aliases mapped, unqualified resolved when there's one table).
 */
export async function parseQuery(sql: string): Promise<QueryShape> {
  // libpg-query types parse() as `any`; cast at this parser boundary only.
  const result = (await parse(sql)) as ParseResult;

  const select = findSelectStmt(result);
  if (!select) throw new Error('Expected a SELECT statement');

  const fromClause = select.fromClause ?? [];
  const rangeVars = collectRangeVars(fromClause);
  const resolve = makeResolver(rangeVars);

  return {
    tables: rangeVars.map((rv) => rv.relname ?? '').filter(Boolean),
    joins: collectJoins(fromClause, resolve),
    filters: collectFilters(select.whereClause, resolve),
    orderBy: collectOrderBy(select.sortClause ?? [], resolve),
    groupBy: collectColumnRefs(select.groupClause ?? [], resolve),
  };
}

// --- column-ref resolution -------------------------------------------------

type Resolver = (fields: string[]) => QueryColumnRef;

/** Map each alias/table name to its real table; resolve unqualified columns to
 *  the sole table when the query has exactly one. */
function makeResolver(rangeVars: RangeVar[]): Resolver {
  const aliasToTable = new Map<string, string>();
  for (const rv of rangeVars) {
    const table = rv.relname ?? '';
    if (!table) continue;
    aliasToTable.set(table, table);
    if (rv.alias?.aliasname) aliasToTable.set(rv.alias.aliasname, table);
  }
  const soleTable = rangeVars.length === 1 ? (rangeVars[0].relname ?? '') : '';

  return (fields) => {
    if (fields.length >= 2) {
      const qualifier = fields[fields.length - 2];
      return { table: aliasToTable.get(qualifier) ?? qualifier, column: fields[fields.length - 1] };
    }
    return { table: soleTable, column: fields[0] ?? '' };
  };
}

// --- clause collectors -----------------------------------------------------

function collectJoins(fromClause: Node[], resolve: Resolver): QueryJoin[] {
  const out: QueryJoin[] = [];
  const visit = (node: Node) => {
    if (!('JoinExpr' in node)) return;
    const j = node.JoinExpr;
    if (j.larg) visit(j.larg);
    if (j.rarg) visit(j.rarg);
    for (const leaf of j.quals ? flattenBoolean(j.quals) : []) {
      const a = asAExpr(leaf);
      if (!a || aExprOp(a) !== '=' || !a.lexpr || !a.rexpr) continue;
      const l = columnRefFields(a.lexpr);
      const r = columnRefFields(a.rexpr);
      if (!l || !r) continue;
      const left = resolve(l);
      const right = resolve(r);
      out.push({
        leftTable: left.table,
        leftColumn: left.column,
        rightTable: right.table,
        rightColumn: right.column,
      });
    }
  };
  for (const node of fromClause) visit(node);
  return out;
}

function collectFilters(where: Node | undefined, resolve: Resolver): QueryFilter[] {
  if (!where) return [];
  const out: QueryFilter[] = [];
  for (const leaf of flattenBoolean(where)) {
    const a = asAExpr(leaf);
    if (!a) continue;
    const op = aExprOp(a);
    if (!op || !COMPARE_OPS.has(op) || !a.lexpr || !a.rexpr) continue;
    const lhs = columnRefFields(a.lexpr);
    const literal = aConstLiteral(a.rexpr);
    if (!lhs || literal === undefined) continue;
    out.push({ ...resolve(lhs), op: op as CompareOp, literal });
  }
  return out;
}

function collectOrderBy(sortClause: Node[], resolve: Resolver): QueryOrderBy[] {
  const out: QueryOrderBy[] = [];
  for (const node of sortClause) {
    if (!('SortBy' in node) || !node.SortBy.node) continue;
    const fields = columnRefFields(node.SortBy.node);
    if (!fields) continue;
    out.push({
      ...resolve(fields),
      direction: node.SortBy.sortby_dir === 'SORTBY_DESC' ? 'desc' : 'asc',
    });
  }
  return out;
}

function collectColumnRefs(nodes: Node[], resolve: Resolver): QueryColumnRef[] {
  const out: QueryColumnRef[] = [];
  for (const node of nodes) {
    const fields = columnRefFields(node);
    if (fields) out.push(resolve(fields));
  }
  return out;
}

// --- AST helpers -----------------------------------------------------------

function findSelectStmt(result: ParseResult): SelectStmt | undefined {
  for (const raw of result.stmts ?? []) {
    const stmt = raw.stmt;
    if (stmt && 'SelectStmt' in stmt) return stmt.SelectStmt;
  }
  return undefined;
}

function collectRangeVars(fromClause: Node[]): RangeVar[] {
  const out: RangeVar[] = [];
  const visit = (node: Node) => {
    if ('RangeVar' in node) out.push(node.RangeVar);
    else if ('JoinExpr' in node) {
      if (node.JoinExpr.larg) visit(node.JoinExpr.larg);
      if (node.JoinExpr.rarg) visit(node.JoinExpr.rarg);
    }
  };
  for (const node of fromClause) visit(node);
  return out;
}

/** Flatten AND/OR trees to their leaf (non-BoolExpr) nodes. */
function flattenBoolean(node: Node): Node[] {
  return 'BoolExpr' in node ? (node.BoolExpr.args ?? []).flatMap(flattenBoolean) : [node];
}

function asAExpr(node: Node): A_Expr | undefined {
  return 'A_Expr' in node ? node.A_Expr : undefined;
}

function aExprOp(a: A_Expr): string | undefined {
  return svals(a.name).at(-1);
}

function columnRefFields(node: Node): string[] | undefined {
  if (!('ColumnRef' in node)) return undefined;
  return svals(node.ColumnRef.fields);
}

function aConstLiteral(node: Node): string | undefined {
  if (!('A_Const' in node)) return undefined;
  const c = node.A_Const;
  if (c.isnull) return 'NULL';
  if (c.sval?.sval !== undefined) return c.sval.sval;
  if (c.ival?.ival !== undefined) return String(c.ival.ival);
  if (c.fval?.fval !== undefined) return c.fval.fval;
  if (c.boolval) return c.boolval.boolval ? 'true' : 'false';
  return undefined;
}

function svals(nodes: Node[] | undefined): string[] {
  return (nodes ?? [])
    .map((n) => ('String' in n ? n.String.sval : undefined))
    .filter((s): s is string => !!s);
}

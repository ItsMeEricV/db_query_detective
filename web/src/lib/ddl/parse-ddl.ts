import { parse } from 'libpg-query';
import type {
  ParseResult,
  Node,
  CreateStmt,
  ColumnDef,
  Constraint,
  ConstrType,
  IndexStmt,
  TypeName,
} from '@pgsql/types';
import {
  type ForeignKey,
  type Index,
  type ParsedColumn,
  type ParsedTable,
  ParsedTableSchema,
} from './parsed-table';

/**
 * Parse one `CREATE TABLE` statement into a {@link ParsedTable} using the
 * official PostgreSQL parser (libpg-query, PG17). No regex — full fidelity.
 */
export async function parseTableDdl(sql: string): Promise<ParsedTable> {
  // libpg-query types parse() as `any`; cast at this parser boundary only.
  const result = (await parse(sql)) as ParseResult;

  const stmts = (result.stmts ?? [])
    .map((raw) => raw.stmt)
    .filter((s): s is Node => s !== undefined);

  const creates = stmts.filter(
    (s): s is Extract<Node, { CreateStmt: CreateStmt }> => 'CreateStmt' in s,
  );
  if (creates.length === 0) throw new Error('Expected a CREATE TABLE statement');
  if (creates.length > 1) throw new Error('Expected exactly one CREATE TABLE statement per DDL');
  const create = creates[0].CreateStmt;

  const table = create.relation?.relname;
  if (!table) throw new Error('CREATE TABLE is missing a table name');

  const columns: ParsedColumn[] = [];
  const keys: TableKeys = { primaryKey: [], foreignKeys: [], uniques: [] };
  for (const elt of create.tableElts ?? []) {
    const col = asColumnDef(elt);
    if (col) {
      columns.push(parseColumn(col));
      collectColumnKeys(col, keys);
      continue;
    }
    const con = asConstraint(elt);
    if (con) collectTableKeys(con, keys);
  }

  const indexes: Index[] = stmts
    .filter((s): s is Extract<Node, { IndexStmt: IndexStmt }> => 'IndexStmt' in s)
    .map((s) => parseIndex(s.IndexStmt));

  return ParsedTableSchema.parse({ table, columns, ...keys, indexes });
}

function parseIndex(idx: IndexStmt): Index {
  return {
    name: idx.idxname ?? '',
    columns: (idx.indexParams ?? [])
      .map((p) => ('IndexElem' in p ? p.IndexElem.name : undefined))
      .filter((c): c is string => !!c),
    unique: idx.unique === true,
  };
}

interface TableKeys {
  primaryKey: string[];
  foreignKeys: ForeignKey[];
  uniques: string[][];
}

function collectColumnKeys(col: ColumnDef, keys: TableKeys): void {
  const name = col.colname ?? '';
  for (const c of (col.constraints ?? []).map(asConstraint).filter((c): c is Constraint => !!c)) {
    if (c.contype === 'CONSTR_PRIMARY') keys.primaryKey.push(name);
    else if (c.contype === 'CONSTR_UNIQUE') keys.uniques.push([name]);
    else if (c.contype === 'CONSTR_FOREIGN')
      keys.foreignKeys.push({
        columns: [name],
        refTable: c.pktable?.relname ?? '',
        refColumns: stringList(c.pk_attrs),
      });
  }
}

function collectTableKeys(c: Constraint, keys: TableKeys): void {
  if (c.contype === 'CONSTR_PRIMARY') keys.primaryKey.push(...stringList(c.keys));
  else if (c.contype === 'CONSTR_UNIQUE') keys.uniques.push(stringList(c.keys));
  else if (c.contype === 'CONSTR_FOREIGN')
    keys.foreignKeys.push({
      columns: stringList(c.fk_attrs),
      refTable: c.pktable?.relname ?? '',
      refColumns: stringList(c.pk_attrs),
    });
}

const SERIAL_TYPES = new Set([
  'serial',
  'serial4',
  'bigserial',
  'serial8',
  'smallserial',
  'serial2',
]);

function parseColumn(col: ColumnDef): ParsedColumn {
  const constraints = (col.constraints ?? []).map(asConstraint).filter((c): c is Constraint => !!c);
  const has = (t: ConstrType) => constraints.some((c) => c.contype === t);

  const notNull = col.is_not_null === true || has('CONSTR_NOTNULL') || has('CONSTR_PRIMARY');
  const base = typeBaseName(col.typeName);

  const column: ParsedColumn = {
    name: col.colname ?? '',
    pgType: normalizeType(col.typeName),
    nullable: !notNull,
  };

  const rawDefault = constraints.find((c) => c.contype === 'CONSTR_DEFAULT')?.raw_expr;
  const defaultStr = rawDefault ? deparseExpr(rawDefault) : undefined;
  if (defaultStr !== undefined) column.default = defaultStr;

  if (Boolean(col.identity) || has('CONSTR_IDENTITY') || SERIAL_TYPES.has(base)) {
    column.identity = true;
  }

  return column;
}

// --- Type names ------------------------------------------------------------

/** Friendly SQL names for the internal type names libpg-query emits. */
const INTERNAL_TO_SQL: Record<string, string> = {
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  float4: 'real',
  float8: 'double precision',
  bool: 'boolean',
  bpchar: 'char',
};

/** Collect the `sval`s from a list of String nodes (type names, key columns). */
function stringList(nodes: Node[] | undefined): string[] {
  return (nodes ?? [])
    .map((n) => ('String' in n ? n.String.sval : undefined))
    .filter((s): s is string => !!s);
}

/** Last name is the type; any earlier name is the `pg_catalog` schema prefix. */
function typeBaseName(typeName: TypeName | undefined): string {
  return stringList(typeName?.names).at(-1) ?? 'unknown';
}

function normalizeType(typeName: TypeName | undefined): string {
  const base = typeBaseName(typeName);
  const friendly = INTERNAL_TO_SQL[base] ?? base;
  const mods = (typeName?.typmods ?? [])
    .map(typmodToString)
    .filter((s): s is string => s !== undefined);
  return mods.length ? `${friendly}(${mods.join(',')})` : friendly;
}

function typmodToString(node: Node): string | undefined {
  if ('A_Const' in node) {
    const c = node.A_Const;
    if (c.ival?.ival !== undefined) return String(c.ival.ival);
    if (c.sval?.sval !== undefined) return c.sval.sval;
  }
  return undefined;
}

// --- Default expressions (best-effort for the common cases) ----------------

function deparseExpr(node: Node): string | undefined {
  if ('A_Const' in node) {
    const c = node.A_Const;
    if (c.isnull) return 'NULL';
    if (c.sval?.sval !== undefined) return `'${c.sval.sval}'`;
    if (c.ival?.ival !== undefined) return String(c.ival.ival);
    if (c.fval?.fval !== undefined) return c.fval.fval;
    if (c.boolval) return c.boolval.boolval ? 'true' : 'false';
  }
  if ('FuncCall' in node) {
    const fn = node.FuncCall;
    const name = stringList(fn.funcname).at(-1);
    if (name) {
      const args = (fn.args ?? []).map(deparseExpr).filter((s): s is string => s !== undefined);
      return `${name}(${args.join(', ')})`;
    }
  }
  return undefined;
}

// --- AST node narrowing (the Node union is keyed by node name) -------------

function asColumnDef(node: Node): ColumnDef | undefined {
  return 'ColumnDef' in node ? node.ColumnDef : undefined;
}

function asConstraint(node: Node): Constraint | undefined {
  return 'Constraint' in node ? node.Constraint : undefined;
}

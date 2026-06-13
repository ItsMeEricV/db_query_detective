import { z } from 'zod';

/**
 * The parsed, structured form of one table's DDL — the shape `GET /ddls`
 * returns and `Ddl.parsed` stores. Produced by `parseTableDdl` from raw
 * `CREATE TABLE` SQL via libpg-query. See ARCHITECTURE.md ("Parsed DDL shape").
 */
export const ParsedColumnSchema = z.object({
  name: z.string(),
  /** Human-friendly SQL type with typmods, e.g. `integer`, `numeric(10,2)`. */
  pgType: z.string(),
  nullable: z.boolean(),
  /** Raw default expression as written, when present (e.g. `now()`, `'pending'`). */
  default: z.string().optional(),
  /** True for serial types and GENERATED ... AS IDENTITY columns. */
  identity: z.boolean().optional(),
});

export const ForeignKeySchema = z.object({
  columns: z.array(z.string()),
  refTable: z.string(),
  refColumns: z.array(z.string()),
});

export const IndexSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean(),
});

export const ParsedTableSchema = z.object({
  table: z.string(),
  columns: z.array(ParsedColumnSchema),
  primaryKey: z.array(z.string()),
  foreignKeys: z.array(ForeignKeySchema),
  uniques: z.array(z.array(z.string())),
  indexes: z.array(IndexSchema),
});

export type ParsedColumn = z.infer<typeof ParsedColumnSchema>;
export type ForeignKey = z.infer<typeof ForeignKeySchema>;
export type Index = z.infer<typeof IndexSchema>;
export type ParsedTable = z.infer<typeof ParsedTableSchema>;

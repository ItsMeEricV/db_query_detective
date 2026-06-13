import { describe, it, expect } from 'vitest';
import { parseTableDdl } from './parse-ddl';

describe('parseTableDdl', () => {
  it('parses the table name and simple columns', async () => {
    const parsed = await parseTableDdl('CREATE TABLE widgets (id integer, name text)');

    expect(parsed.table).toBe('widgets');
    expect(parsed.columns).toEqual([
      { name: 'id', pgType: 'integer', nullable: true },
      { name: 'name', pgType: 'text', nullable: true },
    ]);
  });

  it('marks NOT NULL and PRIMARY KEY columns as non-nullable', async () => {
    const parsed = await parseTableDdl(
      'CREATE TABLE t (id integer PRIMARY KEY, name text NOT NULL, note text)',
    );

    const nullable = Object.fromEntries(parsed.columns.map((c) => [c.name, c.nullable]));
    expect(nullable).toEqual({ id: false, name: false, note: true });
  });

  it('captures type modifiers', async () => {
    const parsed = await parseTableDdl('CREATE TABLE t (price numeric(10,2), code varchar(255))');

    expect(parsed.columns.map((c) => c.pgType)).toEqual(['numeric(10,2)', 'varchar(255)']);
  });

  it('captures common column default expressions', async () => {
    const parsed = await parseTableDdl(
      "CREATE TABLE t (status text DEFAULT 'pending', created_at timestamptz DEFAULT now(), n integer)",
    );

    const defaults = Object.fromEntries(parsed.columns.map((c) => [c.name, c.default]));
    expect(defaults.status).toBe("'pending'");
    expect(defaults.created_at).toBe('now()');
    expect(defaults.n).toBeUndefined();
  });

  it('flags serial and identity columns', async () => {
    const parsed = await parseTableDdl(
      'CREATE TABLE t (id bigserial, n bigint GENERATED ALWAYS AS IDENTITY, plain integer)',
    );

    const identity = Object.fromEntries(parsed.columns.map((c) => [c.name, c.identity]));
    expect(identity.id).toBe(true);
    expect(identity.n).toBe(true);
    expect(identity.plain).toBeUndefined();
  });

  it('extracts a column-level primary key', async () => {
    const parsed = await parseTableDdl('CREATE TABLE t (id integer PRIMARY KEY, name text)');
    expect(parsed.primaryKey).toEqual(['id']);
  });

  it('extracts a table-level composite primary key', async () => {
    const parsed = await parseTableDdl('CREATE TABLE t (a integer, b integer, PRIMARY KEY (a, b))');
    expect(parsed.primaryKey).toEqual(['a', 'b']);
  });

  it('extracts a column-level foreign key', async () => {
    const parsed = await parseTableDdl(
      'CREATE TABLE t (customer_id bigint REFERENCES customers (id))',
    );
    expect(parsed.foreignKeys).toEqual([
      { columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] },
    ]);
  });

  it('extracts a table-level composite foreign key', async () => {
    const parsed = await parseTableDdl(
      'CREATE TABLE t (a integer, b integer, FOREIGN KEY (a, b) REFERENCES other (x, y))',
    );
    expect(parsed.foreignKeys).toEqual([
      { columns: ['a', 'b'], refTable: 'other', refColumns: ['x', 'y'] },
    ]);
  });

  it('extracts column-level and table-level unique constraints', async () => {
    const colLevel = await parseTableDdl('CREATE TABLE t (email text UNIQUE)');
    expect(colLevel.uniques).toEqual([['email']]);

    const tableLevel = await parseTableDdl('CREATE TABLE t (a integer, b integer, UNIQUE (a, b))');
    expect(tableLevel.uniques).toEqual([['a', 'b']]);
  });

  it('extracts indexes from CREATE INDEX statements in the same blob', async () => {
    const parsed = await parseTableDdl(
      'CREATE TABLE t (a integer, b integer); CREATE INDEX idx_a ON t (a); CREATE UNIQUE INDEX idx_ab ON t (a, b);',
    );
    expect(parsed.indexes).toEqual([
      { name: 'idx_a', columns: ['a'], unique: false },
      { name: 'idx_ab', columns: ['a', 'b'], unique: true },
    ]);
  });

  it('throws when the DDL contains more than one CREATE TABLE', async () => {
    await expect(
      parseTableDdl('CREATE TABLE a (id integer); CREATE TABLE b (id integer)'),
    ).rejects.toThrow(/one CREATE TABLE/i);
  });

  it('throws when there is no CREATE TABLE statement', async () => {
    await expect(parseTableDdl('SELECT 1')).rejects.toThrow(/CREATE TABLE/i);
  });
});

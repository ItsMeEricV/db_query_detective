import { Client } from 'pg';
import { getDatabaseUrl } from '@/environment';

/** Double-quote a SQL identifier (table/column/schema). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * A dedicated Postgres connection for one analysis run. Uses a single Client
 * (not a pool) because `search_path` is session-scoped — every statement in the
 * run must see the disposable `s_<token>` schema. Always `close()` in a finally.
 */
/** Per-statement timeout so a pathological user query can't tie up a connection. */
const STATEMENT_TIMEOUT_MS = 30_000;

export class PgDb {
  private constructor(private readonly client: Client) {}

  static async connect(): Promise<PgDb> {
    const client = new Client({ connectionString: getDatabaseUrl() });
    await client.connect();
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    return new PgDb(client);
  }

  /** Run a statement (or multi-statement string) with no result handling. */
  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const res = await this.client.query(sql);
    return res.rows as T[];
  }

  /**
   * Run a query inside a READ ONLY transaction. Blocks any write/DDL even if a
   * second statement somehow reaches the driver — defense-in-depth around
   * running the user's query. Always rolls back.
   */
  async queryReadOnly<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    await this.client.query('BEGIN READ ONLY');
    try {
      const res = await this.client.query(sql);
      return res.rows as T[];
    } finally {
      await this.client.query('ROLLBACK').catch(() => {});
    }
  }

  async createSchema(schema: string): Promise<void> {
    await this.exec(`CREATE SCHEMA ${quoteIdent(schema)}`);
    await this.exec(`SET search_path TO ${quoteIdent(schema)}`);
  }

  async dropSchema(schema: string): Promise<void> {
    await this.exec(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  }

  /** Bulk-insert rows in batched multi-row INSERTs (parameterized — no escaping
   *  hazards). COPY would be faster; this is plenty for v1's modest scale. */
  async bulkLoad(table: string, columns: string[], rows: unknown[][]): Promise<void> {
    if (rows.length === 0) return;
    const colList = columns.map(quoteIdent).join(', ');
    const width = columns.length;
    const BATCH = 1000;

    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      const params: unknown[] = [];
      const tuples = batch
        .map((row, r) => `(${row.map((_, c) => `$${r * width + c + 1}`).join(', ')})`)
        .join(', ');
      for (const row of batch) params.push(...row);
      await this.client.query(
        `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${tuples}`,
        params,
      );
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

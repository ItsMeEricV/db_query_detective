import { SessionIdSchema, upsertDdl } from '@/lib/ddl/ddl-service';
import type { ParsedTable } from '@/lib/ddl/parsed-table';
import { DEMO_QUERIES, DEMO_TABLES, type DemoQuery } from './demo-data';

/**
 * Populate a session with the demo schema (so it shows up in GET /ddls and can
 * be analyzed) and hand back the parsed tables plus the demo query ladder.
 * Tables are upserted in dependency order.
 */
export async function seedDemoData(
  sessionId: string,
): Promise<{ tables: ParsedTable[]; queries: DemoQuery[] }> {
  const id = SessionIdSchema.parse(sessionId);

  const tables: ParsedTable[] = [];
  for (const { tableName, sql } of DEMO_TABLES) {
    tables.push(await upsertDdl({ sessionId: id, tableName, sql }));
  }

  return { tables, queries: DEMO_QUERIES };
}

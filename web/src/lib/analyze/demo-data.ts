/**
 * Canned demo schema + a ladder of queries (clean → progressively pathological)
 * served by POST /api/seed-demo-data. The schema is intentionally **PK-only**
 * (no secondary indexes), so filtering/sorting on non-key columns shows up as
 * sequential scans + sorts — which is what makes queries 3 and 4 light up the
 * analyzer.
 */

import { z } from 'zod';
import { ParsedTableSchema } from '@/lib/ddl/parsed-table';

export interface DemoTable {
  tableName: string;
  sql: string;
}

/** One rung of the demo query ladder. Returned by POST /seed-demo-data and
 *  shown as a clickable chip in the UI. */
export const DemoQuerySchema = z.object({
  title: z.string(),
  description: z.string(),
  /** 1 (simplest) … 4 (most pathological). */
  complexity: z.number().int(),
  sql: z.string(),
});
export type DemoQuery = z.infer<typeof DemoQuerySchema>;

/** Response contract for POST /seed-demo-data — the parsed seeded tables plus
 *  the demo query ladder. The client Zod-parses this at the fetch boundary. */
export const SeedDemoResponseSchema = z.object({
  tables: z.array(ParsedTableSchema),
  queries: z.array(DemoQuerySchema),
});
export type SeedDemoResponse = z.infer<typeof SeedDemoResponseSchema>;

// Dependency order (parents first) — FKs wire users ← sessions/projects and
// projects/users ← project_assets.
export const DEMO_TABLES: DemoTable[] = [
  {
    tableName: 'users',
    sql: `CREATE TABLE users (
  id bigint PRIMARY KEY,
  email text NOT NULL,
  name text,
  status text NOT NULL,
  created_at timestamptz NOT NULL
)`,
  },
  {
    tableName: 'sessions',
    sql: `CREATE TABLE sessions (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  token text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
)`,
  },
  {
    tableName: 'projects',
    sql: `CREATE TABLE projects (
  id bigint PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES users (id),
  name text NOT NULL,
  visibility text NOT NULL,
  created_at timestamptz NOT NULL
)`,
  },
  {
    tableName: 'project_assets',
    sql: `CREATE TABLE project_assets (
  id bigint PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES projects (id),
  uploaded_by bigint NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL
)`,
  },
];

export const DEMO_QUERIES: DemoQuery[] = [
  {
    title: 'Recent users',
    description: 'Single table, sorted by an unindexed column — the simplest case.',
    complexity: 1,
    sql: `SELECT id, email, created_at
FROM users
ORDER BY created_at DESC
LIMIT 100`,
  },
  {
    title: 'A project and its owner',
    description: 'A tight, well-crafted join anchored on primary keys — should plan cleanly.',
    complexity: 2,
    sql: `SELECT u.email, p.name
FROM projects p
JOIN users u ON u.id = p.owner_id
WHERE p.id = 100`,
  },
  {
    title: 'Filtered users (poorly constructed)',
    description:
      'Many predicates and a multi-column sort, all on unindexed columns — forces a seq scan + sort.',
    complexity: 3,
    sql: `SELECT id, email, name, created_at
FROM users
WHERE status = 'active'
  AND created_at > '2025-01-01'
  AND name <> ''
ORDER BY name ASC, created_at DESC, email ASC`,
  },
  {
    title: 'Everything joined (poorly constructed)',
    description:
      'A four-table join with unindexed filters and sorts — expect hash joins, seq scans, and sort nodes flagged for improvement.',
    complexity: 4,
    sql: `SELECT u.email, p.name, a.kind
FROM users u
JOIN sessions s ON s.user_id = u.id
JOIN projects p ON p.owner_id = u.id
JOIN project_assets a ON a.project_id = p.id
WHERE u.status = 'active'
  AND a.size_bytes > 500000
ORDER BY a.created_at DESC, p.name ASC, u.email ASC`,
  },
];

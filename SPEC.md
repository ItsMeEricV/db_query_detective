# SPEC.md: what we will build for Project XYZ

A tool that takes a developer's schema (DDL) and a query, manufactures a
realistic test database across several data distributions, runs real
`EXPLAIN ANALYZE` against each, and reports structured findings. The
"realistic data from nothing" part is the differentiator; running EXPLAIN is
table stakes.

## Motivation (Problem Statement and Solution)

Existing tools (pgMustard, Postgres MCP Pro, pgtuner_mcp) assume a running,
populated database and help you tune it. None go from bare DDL to a provisioned,
synthetically-seeded database. This tool fills that gap: it builds the data,
so it can run genuine execution (not hypothetical-index estimation) on a
disposable instance where nothing is at stake.

## Product Requirements (Functional)

Two front doors over one engine:

- **MCP server** — the daily driver. The host model (e.g. Claude) orchestrates;
  the engine supplies tools. Lowest friction once configured; can read the
  developer's real DDL from migrations or an existing dev DB.
- **Hosted web app** — the on-ramp. Zero setup, paste DDL + query, ideal for
  demos and one-off checks. Supplies its own single LLM call for narration.

### Goals / Non-goals of the project

**Goals**

- Deterministic, reproducible seeding across distribution modes — no LLM.
- Real `EXPLAIN ANALYZE` on real rows, not planner estimates over statistics.
- A clean engine/LLM split: the engine measures, the LLM decides.

**Non-goals (for now)**

- Multi-engine support — Postgres only. (MySQL dropped; see decision log.)
- Semantic realism of generated values (emails that look like emails); the
  planner reads statistical shape, not meaning.
- Absolute-timing benchmarks portable across machines; timings are relative
  and best-effort. Plan shape is the trustworthy signal.

## Technical Requirements (Non-Functional)

### Architecture (summary)

```
parsed query ─┐
              ├─► deterministic engine ─► structured findings ─► LLM (decides
DDL / schema ─┘   (seed → ANALYZE →          (facts, no advice)     what to
                   EXPLAIN ANALYZE)                                  rerun)
```

The engine is pure measurement and never emits recommendations. The LLM
orchestrates by composing engine calls; its judgment lives in _which call it
makes next_, never inside the engine.

### Core principle: facts vs. advice

The API boundary holds only if the engine never makes a judgment and the LLM
never does a measurement. Concretely:

- The engine emits **flags that are measured facts** (`sort_spilled_to_disk`),
  never advice (`add an index on created_at`).
- The engine may **enumerate** candidate indexes (mechanical, from the parsed
  query) and report their measured effect, but never **selects** one.
- Recommendations and non-obvious rewrites are the LLM's job, made against
  ground-truth numbers it can immediately re-verify by calling the engine again.

There is intentionally **no** `analyzeAndRecommend` endpoint — folding the LLM
into the engine re-entangles the two layers and reintroduces non-determinism
into the trustworthy core.

### mode vocabulary

A _mode_ stresses one axis the query is sensitive to, using the
same columns and cardinality but a different stats shape. The planner reads
`pg_stats`, so each mode is defined by the numeric shape it produces.

| mode           | Stresses               | Mechanism                                   |
| -------------- | ---------------------- | ------------------------------------------- |
| `append_order` | physical correlation≈1 | sorted insertion order (production-like)    |
| `shuffled`     | physical correlation≈0 | randomized insertion order, _same values_   |
| `skewed_range` | predicate selectivity  | most rows weighted to one side of a literal |
| `high_skew`    | value-frequency skew   | zipfian sampling (hot keys / MCV list)      |
| `fan_out`      | join fan-out           | zipfian on a foreign key (one giant parent) |

For multi-table joins, a mode is a **combination** across tables (e.g. low
correlation on the sort column _and_ a fat-tailed join key). The engine
enumerates a small fixed set of combinations; it does not search.

### Proposed APIs

All APIs will pass a `session_id` header/query param for now, a simple UUID for the user's session. In the future this will be a proper auth token :-)

#### GET /ddls

List of all the DDLs for the given session

Arguments: - `session_id` : UUID of a stored user session

**Response**

```
	[
		{
			"table": "users",
			"columns" [...],
		},
		...
	]
```

#### PUT /ddl/{id}

Upsert a new DDL for the given session

#### POST /analyze/

Create a new analysis run on a passed query in the POST body `query`. Must be a table or tables already defined in the DDL. Creates seed data automatically across all modes, then runs the query, returns the analysis across all modes

### Determinism & data reuse

- The seeder uses a seeded PRNG; identical `(schema, query, scenario, seed)`
  yields byte-identical data. Results are reproducible and cacheable.
- Generation is cheap; **load** (`COPY`) is the cost. Cache generated rows so a
  re-run never regenerates.
- `reuseData` is an explicit request flag, not engine cleverness. The typical
  optimization loop is:
  1. `analyze` across all scenarios → read `worstScenario`.
  2. `analyze` again with `reuseData: true`, that scenario pinned, and a
     `schemaChanges` index → engine reloads nothing; just `CREATE INDEX` +
     `ANALYZE` + re-run.
  3. Compare the two structured responses; confirm or try the next idea.
- `ANALYZE` runs after every seed **and** after every schema change, or the
  planner won't see the distribution or the new index.

### Data lifecycle per request

- Default to sequential reuse of one table per scenario:
  `TRUNCATE` → `COPY` → `ANALYZE` → `EXPLAIN ANALYZE`. Use `TRUNCATE`, never
  `DELETE` (no dead-tuple bloat; near-instant).
- Cost at ~100k rows: `TRUNCATE` ms-level, `COPY` ~100–300ms local /
  0.5–2s on Neon, `ANALYZE` ~100–500ms. ~1–3s per scenario.
- Default interactive runs to a modest scale; make large scales (1M+) an
  explicit opt-in.

### Database provisioning boundary

The engine talks to Postgres through a narrow interface so the same code runs
against a local Docker container or a Neon branch.

Per-session isolation is schema-per-session (`CREATE SCHEMA s_<token>` /
`search_path` / `DROP SCHEMA ... CASCADE`), which is portable and avoids Neon's
low branch limits. Driver: node-postgres (`pg@8.21`).

### SQL parsing (DDL + DML)

Don't use custom regex. Use **`libpg-query`** (`@17.x` for PG 17; match the major to the
target Postgres) — the official PostgreSQL C parser compiled to WASM. One
library parses both the DDL (`CREATE TABLE`, indexes, `CREATE STATISTICS`) and
the query DML with full Postgres fidelity, so there is no grammar subset to
fall out of.

## Milestones

Break the project down into logical sets of release criteria.

1. **Backend only**
   - Create all BE APIs and storage.
   - Analysis engine, iteration loop
2. **Hosted UI**
   - Simple Next.js app to show the DDL at the top, Allow the user to add or update the DDL
   - Then have a very simple text input to let the user run Queries and see the analysis.
3. **LLM Analysis for Hosted app**
   - For the hosted app we will use a hosted LLM (in AWS Bedrock) to analyze the output of the /analyze API and then provide Recommendations to the user on how to improve any queries. This should be put in the hosted UI at the bottom after a query is input so we can see what the recommendations might be

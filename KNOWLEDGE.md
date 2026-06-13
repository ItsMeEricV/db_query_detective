# KNOWLEDGE.md: the project glossary

`db_query_detective` takes a developer's schema (DDL) and a query, manufactures
realistic test data across several **modes**, runs real `EXPLAIN ANALYZE`
against each, and reports structured findings. This file pins the canonical
name for every domain concept so the code, the docs, and our conversations all
agree.

It is a glossary and shared-understanding document only — the "what" lives in
`SPEC.md`, the "where/how" in `ARCHITECTURE.md`.

## Language

**Engine**:
The deterministic core that measures: seed → `ANALYZE` → `EXPLAIN ANALYZE`. It
emits **measured facts** and never advice. Pure measurement, no judgment, no
LLM.
_Avoid_: analyzer, backend (too broad)

**Mode**:
One stress axis the query is sensitive to (`append_order`, `shuffled`,
`skewed_range`, `high_skew`, `fan_out`). A mode reshapes the *statistical shape*
of the seeded data (what the planner reads from `pg_stats`) using the same
columns and cardinality — it is not a value generator. Mechanically, a mode is
an **overlay** on the **SeedPlan**: it sets insertion order, range bias, and an
optional skew override on the query's *axis column* for that mode. For
multi-table joins a mode is a fixed **combination** across tables.
_Avoid_: **scenario**, distribution, profile

**SeedPlan**:
The derived, query-driven plan that bridges the parsed schema and the generator:
per table (in FK-topological order — parents before children) the columns to
generate with their distributions, the row counts, the range literal (`ctx`),
and which column is each mode's **axis**. Built deterministically from
(`ParsedTable[]`, parsed query) — no LLM input. Each **mode** is applied as an
overlay on top of it.

**Worst mode**:
The mode whose plan is the most expensive for a given query, measured by the
**root node's planner `Total Cost`** (machine-independent; `Execution Time`
breaks ties — raw timing is too noisy to lead, per PG's own ANALYZE-overhead
caveat). The mode the optimization loop pins and iterates against.
_Avoid_: worstScenario

**Session**:
A `session_id` (UUID) that scopes one user's **DDLs** and **analysis runs**. A
deliberate placeholder for real auth in v1; passed as a header/param.
_Avoid_: account, workspace

**DDL**:
A developer's table definition (`CREATE TABLE`, indexes, `CREATE STATISTICS`).
Stored per session; the API returns it *parsed* (`{table, columns}`), not just
as raw SQL.

**Analysis run**:
One invocation of `/analyze`: a query plus the engine's structured findings
across all modes. The unit of storage and reuse.
_Avoid_: job, report

**Measured fact**:
A flag the engine emits because it *observed* it (`sort_spilled_to_disk`),
backed by a number it can re-verify. Distinct from **advice** ("add an index on
`created_at`"), which only the LLM produces — never the engine.

**Candidate index**:
An index the engine could mechanically **enumerate** from the parsed query and
**measure** the effect of, but never **selects** — selection is advice, the
LLM's job. Enumeration is deferred past v1.

**Schema-per-session**:
The isolation strategy for *disposable* analysis data: `CREATE SCHEMA s_<token>`
+ `search_path` + `DROP SCHEMA ... CASCADE`. Portable across a local Docker
Postgres and a Neon branch; avoids Neon's low branch limits.

**Target Postgres**:
The Postgres major version the **engine** seeds and runs `EXPLAIN ANALYZE`
against. Because plan shape varies across major versions, this must match
production. **v1 standardizes on PG17** to match Neon (PG18 is still rolling
out there); multi-version support is a future goal. Consequences: the local dev
analysis database must also be PG17, and `libpg-query` is pinned to `@17.x`.

## Flagged ambiguities

**"Mode" vs "scenario"** — early drafts (and parts of `SPEC.md`) used
*scenario* and *worstScenario* for the same concept. **Resolution (decided):**
**mode** is the one canonical term everywhere — code, types, APIs, docs.
*scenario* is retired; SPEC.md's remaining `scenario`/`worstScenario` usages are
stale and should be renamed to `mode`/`worst mode`.

## Example dialogue

> **Dev:** When `/analyze` runs, does the engine tell me which index to add?
> **Domain expert:** No — that's advice, and the engine only emits measured
> facts. It can *enumerate* candidate indexes and report each one's measured
> effect, but choosing one is the LLM's job.
> **Dev:** And it runs the query five times?
> **Domain expert:** Once per **mode**. Same columns and row counts each time,
> different statistical shape. Whichever mode produces the most expensive plan
> is the **worst mode** — that's what you'd pin and iterate on.

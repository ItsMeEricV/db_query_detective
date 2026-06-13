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

Two front doors over one engine:

- **MCP server** — the daily driver. The host model (e.g. Claude) orchestrates;
  the engine supplies tools. Lowest friction once configured; can read the
  developer's real DDL from migrations or an existing dev DB.
- **Hosted web app** — the on-ramp. Zero setup, paste DDL + query, ideal for
  demos and one-off checks. Supplies its own single LLM call for narration.x

## Product Requirements (Functional)

- Bulleted list of product (customer facing) requirements for the project
- Label each requirement as P0 (priority zero, must have) or P1 (priority 1, nice to have).
- Make each requirement concise and clear. Wherever possible each requirement should tie back to the problem statement.

### Examples of Good Requirements

- **P0:** Users must be able to reset their password via an emailed magic link within 5 minutes of request.
- **P0:** Dashboard must display a real-time count of active fitness sessions.
- **P1:** Users can export their workout history as a PDF.
  _Why: They are measurable, specific, and define the 'What' without specifying the 'How'._

### Examples of Poor Requirements

- **Poor:** Make the login page look "clean." (Subjective)
- **Poor:** Use a SQL database to store user names. (Prescriptive "How" - belongs in ARCHITECTURE.md)
- **Poor:** The app should be fast. (Not measurable)

## Technical Requirements (Non-Functional)

- Bulleted list of technical requirements to achieve the product requirements.
- Be concise but specific.

### Examples of Good Requirements

1. All APIs should target a p90 latency of 100 milliseconds.
2. All PII (Personally Identifiable Information) must be encrypted at rest using AES-256.
3. The system must support 500 concurrent WebSocket connections.
4. Carefully design the uniqueness of primary keys. **Default to UUIDv7** for any UUID primary key — it is time-sortable and gives B-tree locality close to serial integers without giving up global uniqueness. Reach for UUIDv4 only when unguessability dominates and you accept the index-locality cost.
5. If storing datetime information, default to high-fidelity data types that store both time and timezone information (e.g., `timestamptz` for PostgreSQL).

### Examples of Bad Requirements

1. Don't use too much memory. (Vague)
2. Use a Node.js server. (Implementation detail, belongs in ARCHITECTURE.md)

## Milestones

Break the project down into logical sets of release criteria.

1. **Prototype:** Implement a subset of P0 requirements to test core functionality and feasibility.
2. **GA (General Availability):** All P0 requirements are complete, tested, and documented.

> **Where do hardening / operational items live?** Standards you commit to (e.g. "automated nightly backups with quarterly restore drill", "monthly dependency upgrade cadence") belong in **Technical Requirements** above. Tracking whether each one is done yet belongs in **IMPLEMENTATION_PLAN.md**. SPEC.md describes _what the project is_, not _what work is outstanding_.

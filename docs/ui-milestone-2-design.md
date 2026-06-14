# Milestone 2 — Hosted App UI (design record)

Outcome of the deep-discuss session for the `db_query_detective` web UI. Captures
the decisions that shaped the build so the PR and any follow-up agent can see the
"why" without re-deriving it. Glossary terms (mode, worst mode, measured
fact/flag, session, DDL, analysis run) are defined in `KNOWLEDGE.md`.

## Scope

Build the hosted UI for milestone 2: a **DDL** panel, a **DML** (query) panel
with an **Analysis** view, and a stubbed **Detective** (findings) panel. Layout
follows the user's hand mock (`assets/imgs/ui_mock_v1.jpeg`): three stacked bands
under a "🕵️‍♀️ DB Query Detective" banner.

Milestone 3 (LLM narration of `/analyze` results via Bedrock) is **out of scope**
— the Detective panel is stubbed this PR and hooked up next.

## Decisions

1. **DDL panel (option C).** `GET /ddls` is extended to also return `rawSql`
   (already stored on the `Ddl` row, currently dropped in the `.map`). New
   response type `StoredDdl = ParsedTable + rawSql`; `ParsedTable` and
   `schemaSnapshot` consumers are untouched. The right panel renders the parsed
   **structure** by default (columns with type/nullable/PK/FK/index badges) with
   a "view SQL" toggle; **Add table / Edit** opens a raw `CREATE TABLE` textarea
   → `PUT /ddl/{table}`, and Edit pre-fills from `rawSql`. 400s render inline.

2. **Analysis = engine output; Detective = LLM advice.** Mirrors the glossary's
   facts-vs-advice line. The DML band's **Analysis** view shows the engine's
   measured output; the bottom **Detective** band is the (stubbed) LLM narrative.

3. **Analysis layout (option B — comparison table).** All *applicable* modes as
   rows (mode, total cost, exec time, est rows, actual rows, flags). Worst-mode
   row highlighted; a leading summary line anchors it ("Worst: `high_skew` —
   total cost 12,480"). Clicking a row expands its flag badges + a collapsible,
   default-collapsed raw EXPLAIN JSON view.

4. **Flag badges.** Rendered via a `code → {label, description}` map
   (`seq_scan`, `sort_spilled_to_disk`, `rows_misestimated`), falling back to a
   humanized code for unknown/future codes; `detail` shown on expand.

5. **Demo data.** "Load demo data" button in the **DDL band header** and as the
   empty-state CTA. The 4 returned demo queries render as clickable chips above
   the query textarea (click → drops `sql` in). The DDL seeds server-side
   (survives reload via `GET /ddls`); the demo queries are **persisted to
   `localStorage`** alongside the session id so the chip row survives reloads.

6. **Visual direction.** Data-forward dev-tool aesthetic, dark-default (existing
   `prefers-color-scheme` light fallback kept), monospace for SQL/plan output.
   "Detective" theme is light (language + the findings framing + the 🕵️‍♀️
   banner), not gimmicky. Color is signal: green = clean/cheap, amber→red =
   expensive/flagged; everything else neutral.

7. **Detective stub contract.** `<DetectivePanel result={AnalyzeResult} />`
   renders a "coming soon" state now; milestone 3 fills the body.

8. **i18n — deferred (future todo).** AGENTS.md calls for internationalized
   strings, but no i18n lib is installed and this is a single-locale demo.
   User-facing strings are centralized in one module (clean seam to wrap later);
   no i18n framework this PR.

## State / data (per ARCHITECTURE.md)

- **TanStack Query** for all server state (added as a dep). No `useEffect` data
  fetching. Mutations for `PUT /ddl`, `POST /analyze`, `POST /seed-demo-data`.
- `session_id` is a client-generated UUID persisted in `localStorage`, sent as
  the `session_id` header on every request.
- Business logic / API client / hooks live in `web/src/lib`; `web/src/components`
  stays presentational; `web/src/app/page.tsx` composes.

## Build order

1. Backend: `GET /ddls` returns `StoredDdl[]` (TDD on `ddl-service`).
2. Add deps (`@tanstack/react-query`); rebuild docker node_modules volume.
3. `lib`: session/localStorage, API client, query/mutation hooks, flag-label
   map, strings module (TDD on pure logic).
4. Components (frontend-design): app shell + banner, DDL panel, DML panel,
   Analysis table, Detective stub.
5. Wire `page.tsx`; provider setup in layout.
6. Quality gate (`prettier`, `typecheck`, `lint`, `test`) + manual run on :3005.

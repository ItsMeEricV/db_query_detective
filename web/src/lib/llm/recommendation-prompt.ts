import type { AnalyzeResult, ModeResult } from '@/lib/analyze/analyze-result';

/**
 * Builds the LLM prompt for a query Recommendation from one analysis run.
 *
 * Pure and deterministic: measured facts in → prompt strings out, no IO. The
 * facts the engine measured are ground truth (per KNOWLEDGE.md's facts-vs-
 * recommendation split); the model's only job is to turn them into prescriptive
 * guidance. To control tokens we send every mode's metrics + flags for
 * comparison but the verbatim EXPLAIN plan of the worst mode only — that's the
 * mode the optimization loop pins and iterates on.
 */

const SYSTEM_PROMPT =
  'You are a Staff Database Architect and an expert in PostgreSQL 17 query ' +
  'performance. You read structured findings from a real EXPLAIN ANALYZE run ' +
  'and recommend, to a developer, how to improve the query. The numbers and ' +
  'flags you are given are GROUND TRUTH from a real execution against ' +
  'synthetically-seeded data — never invent or alter metrics, and never claim ' +
  'a measurement the data does not show. ' +
  'Target PostgreSQL 17 specifically: use only syntax and behaviour valid in ' +
  'PostgreSQL 17, and ground every recommendation in the official PostgreSQL 17 ' +
  'documentation at https://www.postgresql.org/docs/17/ rather than general or ' +
  'possibly-outdated recollection. Cite the relevant doc page(s) inline — for ' +
  'example https://www.postgresql.org/docs/17/sql-explain.html, ' +
  'https://www.postgresql.org/docs/17/indexes.html, or ' +
  'https://www.postgresql.org/docs/17/sql-createindex.html — so the developer ' +
  'can verify each suggestion against the primary source. ' +
  'You may recommend indexes, query rewrites, or schema changes, but frame each ' +
  'as a HYPOTHESIS the engine can re-verify by running again — not as a settled ' +
  'conclusion. Be concise and concrete; prefer specific columns and index ' +
  'definitions over generalities. Respond in GitHub-flavored Markdown.';

/** A per-mode summary for the prompt: everything in a ModeResult except the
 *  (potentially large) verbatim plan, which is sent for the worst mode only. */
function modeSummary(m: ModeResult) {
  return { mode: m.mode, rowCounts: m.rowCounts, metrics: m.metrics, flags: m.flags };
}

export function buildRecommendationPrompt(result: AnalyzeResult): {
  system: string;
  prompt: string;
} {
  const worst = result.modes.find((m) => m.mode === result.worstMode);

  const sections = [
    `Query under analysis:\n${result.query}`,
    `Schema (parsed DDL — tables, columns, keys, existing indexes):\n${JSON.stringify(
      result.schemaSnapshot,
      null,
      2,
    )}`,
    `Worst mode: ${result.worstMode} (the most expensive plan by planner total cost).`,
    `Per-mode measured findings — the engine's ground truth (metrics + flags for every mode):\n${JSON.stringify(
      result.modes.map(modeSummary),
      null,
      2,
    )}`,
  ];

  if (worst) {
    sections.push(
      `Verbatim EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) for the worst mode (${result.worstMode}):\n${JSON.stringify(
        worst.plan,
        null,
        2,
      )}`,
    );
  }

  return { system: SYSTEM_PROMPT, prompt: sections.join('\n\n') };
}

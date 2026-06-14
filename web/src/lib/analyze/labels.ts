/**
 * Human-readable labels for the engine's open-ended vocabularies: mode names and
 * measured-fact flag codes. Both sets can grow (flags especially — the engine's
 * detector set is documented as "grows over time"), so every lookup falls back
 * to a humanized form of the raw code rather than dropping or mislabeling it.
 *
 * Pure and presentational — no advice here (advice is the LLM's job per the
 * facts-vs-advice split). Labels describe *what was measured*, never *what to do*.
 */

/** snake_case / kebab-case → Title Case, the fallback for unknown codes. */
export function humanizeCode(code: string): string {
  return code
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const MODE_LABELS: Record<string, string> = {
  append_order: 'Append order',
  shuffled: 'Shuffled',
  skewed_range: 'Skewed range',
  high_skew: 'High skew',
  fan_out: 'Fan-out',
};

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? humanizeCode(mode);
}

export interface FlagLabel {
  label: string;
  /** A neutral description of the measured fact — what was observed, not advice. */
  description: string;
}

const FLAG_LABELS: Record<string, FlagLabel> = {
  seq_scan: {
    label: 'Sequential scan',
    description: 'The planner scanned the whole table rather than using an index.',
  },
  sort_spilled_to_disk: {
    label: 'Sort spilled to disk',
    description: 'A sort exceeded work_mem and fell back to an on-disk merge.',
  },
  rows_misestimated: {
    label: 'Row estimate off ≥10×',
    description: "The planner's row estimate diverged from the actual count by 10× or more.",
  },
};

export function flagLabel(code: string): FlagLabel {
  return FLAG_LABELS[code] ?? { label: humanizeCode(code), description: '' };
}

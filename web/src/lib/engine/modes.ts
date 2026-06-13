/**
 * The seeding modes — each stresses one axis the query is sensitive to. See
 * KNOWLEDGE.md ("mode") and ARCHITECTURE.md ("Engine: seeding model").
 */
export type ModeName = 'append_order' | 'shuffled' | 'skewed_range' | 'high_skew' | 'fan_out';

/** Canonical order, used to present modes consistently. */
export const ALL_MODES: readonly ModeName[] = [
  'append_order',
  'shuffled',
  'skewed_range',
  'high_skew',
  'fan_out',
];

/**
 * Centralized user-facing copy. One module so wrapping the UI in an i18n
 * framework later (a deferred follow-up — see docs/ui-milestone-2-design.md) is a
 * mechanical change rather than a hunt through JSX. No string literals shown to
 * the user should live in components.
 */
export const strings = {
  app: {
    title: 'DB Query Detective',
    tagline: 'Manufacture realistic data, run real EXPLAIN ANALYZE, read the evidence.',
  },
  ddl: {
    heading: 'DDL',
    loadDemo: 'Load demo data',
    loading: 'Loading schema…',
    addTable: 'Add table',
    edit: 'Edit',
    save: 'Save table',
    saving: 'Saving…',
    cancel: 'Cancel',
    emptyTitle: 'No tables yet',
    emptyHint: 'Load the demo schema or add a table to get started.',
    viewStructure: 'Structure',
    viewSql: 'SQL',
    selectHint: 'Select a table to inspect its structure.',
    sqlPlaceholder: 'CREATE TABLE my_table (\n  id bigint PRIMARY KEY,\n  …\n)',
    columnsHeading: 'Columns',
    keysHeading: 'Keys & indexes',
    primaryKey: 'Primary key',
    foreignKey: 'Foreign key',
    unique: 'Unique',
    index: 'Index',
    nullable: 'nullable',
  },
  dml: {
    heading: 'DML',
    queryLabel: 'Query',
    queryPlaceholder: 'SELECT … FROM … — paste a query to analyze',
    analyze: 'Analyze',
    analyzing: 'Analyzing…',
    demoChipsLabel: 'Demo queries',
  },
  analysis: {
    heading: 'Analysis',
    emptyHint: 'Run a query to measure it across data-distribution modes.',
    worstLabel: 'Worst mode',
    colMode: 'Mode',
    colCost: 'Total cost',
    colExec: 'Exec time',
    colEstRows: 'Est. rows',
    colActualRows: 'Actual rows',
    colEstimate: 'Estimate',
    colFlags: 'Findings',
    noFlags: 'No flags',
    rowCounts: 'Seeded rows',
    rawPlan: 'Raw EXPLAIN plan',
    worstBadge: 'WORST',
  },
  detective: {
    heading: 'Detective',
    comingSoonTitle: 'LLM analysis coming soon',
    comingSoonHint:
      "Next milestone: the detective reads the engine's measured findings and recommends how to improve the query. The wiring lands in a follow-up.",
    emptyHint: 'Run a query and the detective will weigh in on the evidence.',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
  },
} as const;

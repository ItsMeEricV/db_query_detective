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
    hint: 'Data Definition Language — the SQL that defines your tables.',
    loadDemo: 'Load demo data',
    loading: 'Loading schema…',
    clearAll: 'Clear all',
    clearing: 'Clearing…',
    clearTitle: 'Clear everything?',
    clearBody:
      'This permanently removes every table and analysis result in this session — including the demo data — and resets the workspace. This can’t be undone.',
    clearConfirm: 'Clear everything',
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
    tableNameLabel: 'Table name',
    tableNameHint: 'Must match the table named in the CREATE TABLE statement.',
    createTableLabel: 'CREATE TABLE',
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
    hint: 'Data Manipulation Language — the SQL that reads or changes your data.',
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
    zeroRowsNote: 'This query matched no rows — there’s nothing for the modes to differentiate.',
    flatCostNote:
      'All modes planned within 1% — at this data scale the distribution didn’t move the cost.',
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

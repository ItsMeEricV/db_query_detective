'use client';

import { useState } from 'react';
import type { StoredDdl } from '@/lib/ddl/parsed-table';
import { strings } from '@/lib/strings';
import { Button } from '../Button';
import { DdlEditor } from './DdlEditor';
import { TableStructure } from './TableStructure';

type EditorState = null | { mode: 'add' | 'edit' };

/** The DDL band body: a table list (left) and a structure/SQL inspector or the
 *  add/edit editor (right). Purely presentational — data + the save callback
 *  come from the container. */
export function DdlPanel({
  tables,
  isLoading,
  loadError,
  onLoadDemo,
  loadingDemo,
  onSaveTable,
  saving,
  saveError,
  onResetError,
}: {
  tables: StoredDdl[];
  isLoading: boolean;
  loadError: string | null;
  onLoadDemo: () => void;
  loadingDemo: boolean;
  onSaveTable: (name: string, sql: string) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  onResetError: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [view, setView] = useState<'structure' | 'sql'>('structure');

  const active = tables.find((t) => t.table === selected) ?? tables[0] ?? null;

  const openAdd = () => {
    onResetError();
    setEditor({ mode: 'add' });
  };
  const openEdit = () => {
    onResetError();
    setEditor({ mode: 'edit' });
  };
  const closeEditor = () => {
    onResetError();
    setEditor(null);
  };
  const handleSave = async (name: string, sql: string) => {
    try {
      await onSaveTable(name, sql);
      setSelected(name);
      setView('structure');
      setEditor(null);
    } catch {
      // saveError is rendered inline by the editor; keep it open.
    }
  };

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted">{strings.ddl.loading}</p>;
  }

  if (loadError) {
    return (
      <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 font-mono text-xs text-bad">
        {loadError}
      </p>
    );
  }

  // Empty state — the headline entry point into the demo.
  if (tables.length === 0 && !editor) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-display text-xl text-ink">{strings.ddl.emptyTitle}</p>
        <p className="max-w-sm text-sm text-muted">{strings.ddl.emptyHint}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" onClick={onLoadDemo} disabled={loadingDemo}>
            {loadingDemo ? strings.ddl.loading : strings.ddl.loadDemo}
          </Button>
          <Button onClick={openAdd}>{strings.ddl.addTable}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[210px_1fr]">
      {/* Table list */}
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {tables.map((t) => {
            const isActive = active?.table === t.table && !editor;
            return (
              <li key={t.table}>
                <button
                  onClick={() => {
                    setSelected(t.table);
                    setEditor(null);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left font-mono text-sm transition-colors ${
                    isActive
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-line bg-surface-2/40 text-ink hover:border-line-strong'
                  }`}
                >
                  {t.table}
                </button>
              </li>
            );
          })}
        </ul>
        <Button onClick={openAdd} className="mt-1 w-full">
          + {strings.ddl.addTable}
        </Button>
      </div>

      {/* Detail / editor */}
      <div className="min-w-0 rounded-md border border-line bg-surface/40 p-4">
        {editor ? (
          <DdlEditor
            lockName={editor.mode === 'edit'}
            initialName={editor.mode === 'edit' ? (active?.table ?? '') : ''}
            initialSql={editor.mode === 'edit' ? (active?.rawSql ?? '') : ''}
            saving={saving}
            error={saveError}
            onSave={handleSave}
            onCancel={closeEditor}
          />
        ) : active ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-mono text-base text-ink">{active.table}</h3>
              <div className="ml-auto flex items-center gap-2">
                <ViewToggle view={view} onChange={setView} />
                <Button onClick={openEdit}>{strings.ddl.edit}</Button>
              </div>
            </div>
            {view === 'structure' ? (
              <TableStructure table={active} />
            ) : (
              <pre className="scrollbar-thin overflow-x-auto rounded-md border border-line bg-surface-2/40 p-3 font-mono text-sm leading-relaxed text-ink">
                {active.rawSql}
              </pre>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">{strings.ddl.selectHint}</p>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'structure' | 'sql';
  onChange: (v: 'structure' | 'sql') => void;
}) {
  const opts: { key: 'structure' | 'sql'; label: string }[] = [
    { key: 'structure', label: strings.ddl.viewStructure },
    { key: 'sql', label: strings.ddl.viewSql },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 font-mono text-xs transition-colors ${
            view === o.key
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-2/40 text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

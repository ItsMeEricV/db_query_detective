'use client';

import { useState } from 'react';
import { strings } from '@/lib/strings';
import { Button } from '../Button';

/**
 * Add / edit one table. The table name is an explicit field (it's the PUT path
 * segment); the server is the source of truth and rejects a name that doesn't
 * match the CREATE TABLE — that 400 surfaces inline via `error`. When editing,
 * the name is locked and the SQL pre-fills from the stored rawSql.
 */
export function DdlEditor({
  initialName = '',
  initialSql = '',
  lockName = false,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initialName?: string;
  initialSql?: string;
  lockName?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (name: string, sql: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [sql, setSql] = useState(initialSql);
  const canSave = name.trim().length > 0 && sql.trim().length > 0 && !saving;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(name.trim(), sql);
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="ddl-table-name"
          className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint"
        >
          {strings.ddl.tableNameLabel}
        </label>
        <input
          id="ddl-table-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={lockName || saving}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-accent/60 disabled:opacity-60"
          placeholder="users"
        />
        <p className="text-xs text-faint">{strings.ddl.tableNameHint}</p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="ddl-sql"
          className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint"
        >
          {strings.ddl.createTableLabel}
        </label>
        <textarea
          id="ddl-sql"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          disabled={saving}
          spellCheck={false}
          rows={11}
          className="scrollbar-thin w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent/60 disabled:opacity-60"
          placeholder={strings.ddl.sqlPlaceholder}
        />
      </div>

      {error && (
        <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 font-mono text-xs text-bad">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!canSave}>
          {saving ? strings.ddl.saving : strings.ddl.save}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving}>
          {strings.ddl.cancel}
        </Button>
      </div>
    </form>
  );
}

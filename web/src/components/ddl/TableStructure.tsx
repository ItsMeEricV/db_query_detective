import type { ForeignKey, ParsedTable } from '@/lib/ddl/parsed-table';
import { strings } from '@/lib/strings';
import { Tag } from '../Tag';

/** Read-only render of a parsed table: columns with type/key/constraint tags,
 *  then a compact keys-and-indexes summary. */
export function TableStructure({ table }: { table: ParsedTable }) {
  const pk = new Set(table.primaryKey);
  const fkByCol = new Map<string, ForeignKey>();
  for (const fk of table.foreignKeys) for (const c of fk.columns) fkByCol.set(c, fk);

  const hasKeySummary =
    table.primaryKey.length > 0 ||
    table.foreignKeys.length > 0 ||
    table.uniques.length > 0 ||
    table.indexes.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
          {strings.ddl.columnsHeading}
        </h4>
        <ul className="overflow-hidden rounded-md border border-line">
          {table.columns.map((col) => {
            const fk = fkByCol.get(col.name);
            return (
              <li
                key={col.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/70 bg-surface-2/40 px-3 py-2 last:border-b-0"
              >
                <span className="font-mono text-sm text-ink">{col.name}</span>
                <span className="font-mono text-xs text-muted">{col.pgType}</span>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                  {pk.has(col.name) && <Tag tone="accent">{strings.ddl.primaryKey}</Tag>}
                  {fk && <Tag tone="muted">→ {fk.refTable}</Tag>}
                  {!col.nullable && <Tag tone="muted">not null</Tag>}
                  {col.identity && <Tag tone="muted">identity</Tag>}
                  {col.default && <Tag tone="muted">default {col.default}</Tag>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {hasKeySummary && (
        <div>
          <h4 className="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
            {strings.ddl.keysHeading}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {table.primaryKey.length > 0 && (
              <Tag tone="accent">
                {strings.ddl.primaryKey} ({table.primaryKey.join(', ')})
              </Tag>
            )}
            {table.foreignKeys.map((fk, i) => (
              <Tag key={`fk-${i}`} tone="muted">
                {fk.columns.join(', ')} → {fk.refTable} ({fk.refColumns.join(', ')})
              </Tag>
            ))}
            {table.uniques.map((u, i) => (
              <Tag key={`u-${i}`} tone="muted">
                {strings.ddl.unique} ({u.join(', ')})
              </Tag>
            ))}
            {table.indexes.map((idx) => (
              <Tag key={idx.name} tone="muted">
                {idx.unique ? `${strings.ddl.unique} ` : ''}
                {strings.ddl.index} {idx.name} ({idx.columns.join(', ')})
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

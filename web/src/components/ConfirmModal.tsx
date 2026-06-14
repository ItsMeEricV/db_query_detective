'use client';

import { useEffect, useId } from 'react';
import { Button } from './Button';

/**
 * A small accessible confirmation dialog. Rendered only while `open`, so its
 * non-deterministic `useId` never runs during SSR (no hydration mismatch).
 * Escape and backdrop-click cancel; the cancel button takes initial focus.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-lg border border-line-strong bg-surface p-6 shadow-2xl">
        <h2 id={titleId} className="font-display text-xl text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button autoFocus onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

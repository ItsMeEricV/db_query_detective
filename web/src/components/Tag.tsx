import type { ReactNode } from 'react';

type Tone = 'accent' | 'muted' | 'ok' | 'warn' | 'bad';

const tones: Record<Tone, string> = {
  accent: 'border-accent/40 bg-accent/10 text-accent',
  muted: 'border-line-strong bg-surface-2 text-muted',
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/30 bg-bad/10 text-bad',
};

/** A small monospace pill used for column attributes, keys, and badges. */
export function Tag({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.68rem] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

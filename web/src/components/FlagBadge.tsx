import type { ModeFlag } from '@/lib/analyze/analyze-result';
import { flagLabel } from '@/lib/analyze/labels';
import { Tag } from './Tag';

/**
 * A single measured-fact flag, rendered as an amber caution pill. The full
 * neutral description (and any structured `detail`) shows on hover — these are
 * observations, not advice.
 */
export function FlagBadge({ flag }: { flag: ModeFlag }) {
  const { label, description } = flagLabel(flag.code);
  const detail = flag.detail ? JSON.stringify(flag.detail) : '';
  const title = [description, detail].filter(Boolean).join(' · ');
  return (
    <span title={title || undefined}>
      <Tag tone="warn">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
        {label}
      </Tag>
    </span>
  );
}

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-[#1b1305] hover:bg-accent-hover',
  ghost: 'border border-line-strong bg-surface-2 text-ink hover:border-accent/60 hover:text-accent',
  danger: 'bg-bad text-white hover:opacity-90',
};

/** Shared button. `primary` = the brass call-to-action; `ghost` = everything else. */
export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

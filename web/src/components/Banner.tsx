import { strings } from '@/lib/strings';

/** The case-file header: 🕵️‍♀️ + the title in the editorial display serif. */
export function Banner() {
  return (
    <header className="relative overflow-hidden rounded-lg border border-line-strong bg-surface/70 px-6 py-7">
      {/* desk-lamp glow, top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)',
        }}
      />
      <div className="relative flex items-center gap-4">
        <span className="text-4xl leading-none sm:text-5xl" aria-hidden>
          🕵️‍♀️
        </span>
        <div>
          <h1 className="font-display text-3xl font-black leading-none tracking-tight text-ink sm:text-[2.6rem]">
            {strings.app.title}
          </h1>
          <p className="mt-2 font-mono text-xs text-muted">{strings.app.tagline}</p>
        </div>
      </div>
    </header>
  );
}

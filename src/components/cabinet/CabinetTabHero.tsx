"use client";

interface Props {
  title: string;
  subtitle?: string;
  kicker?: string;
}

export default function CabinetTabHero({ title, subtitle, kicker }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-950/50 via-black/40 to-amber-950/20 px-5 py-4 sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-purple-600/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 left-1/3 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
      <div className="relative">
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">
            {kicker}
          </p>
        ) : null}
        <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1.5 max-w-lg text-sm text-white/55">{subtitle}</p> : null}
      </div>
    </div>
  );
}

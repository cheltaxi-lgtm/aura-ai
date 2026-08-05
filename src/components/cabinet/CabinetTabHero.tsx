"use client";

interface Props {
  title: string;
  subtitle?: string;
  kicker?: string;
}

export default function CabinetTabHero({ title, subtitle, kicker }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(201,162,74,0.18)] bg-aura-surface px-5 py-4 sm:px-6 sm:py-5">
      <div className="relative">
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aura-gold/75">
            {kicker}
          </p>
        ) : null}
        <h2 className="mt-1 font-display text-xl font-medium text-aura-ivory sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1.5 max-w-lg text-sm text-[rgba(237,230,218,0.55)]">{subtitle}</p> : null}
      </div>
    </div>
  );
}

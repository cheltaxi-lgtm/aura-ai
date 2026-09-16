import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  calculator: ReactNode;
  variant: "matrix" | "natal";
};

function MatrixIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[390px] rounded-2xl border border-aura-gold/25 bg-[#1a1816]/90 p-6 shadow-2xl" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div><p className="font-display text-lg text-white">Ваша матрица</p><p className="text-xs text-white/45">Пример схемы</p></div>
        <span className="rounded-full border border-aura-gold/25 px-3 py-1 text-[10px] uppercase tracking-widest text-aura-champagne">демо</span>
      </div>
      <div className="relative mx-auto my-9 flex h-48 w-48 items-center justify-center">
        <div className="absolute inset-5 rotate-45 border border-aura-gold/45" />
        <div className="absolute inset-5 border border-aura-gold/30" />
        <div className="absolute inset-0 rounded-full border border-aura-gold/15" />
        <span className="font-display text-5xl text-aura-champagne">9</span>
        <span className="absolute top-1 text-sm text-aura-gold">1</span>
        <span className="absolute bottom-1 text-sm text-aura-gold">1</span>
        <span className="absolute left-0 text-sm text-aura-gold">10</span>
        <span className="absolute right-0 text-sm text-aura-gold">18</span>
      </div>
      <div className="space-y-2 text-xs text-white/55">
        <div className="rounded-lg bg-black/35 px-3 py-2">Центральная энергия · 9</div>
        <div className="rounded-lg bg-black/35 px-3 py-2">Линии отношений и реализации</div>
      </div>
    </div>
  );
}

function NatalIllustration() {
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[390px] items-center justify-center" aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-aura-gold/20 shadow-[0_0_90px_rgba(201,162,74,0.1)]" />
      <div className="absolute inset-[8%] rounded-full border border-dashed border-aura-gold/30" />
      <div className="absolute inset-[23%] rounded-full border border-aura-gold/35" />
      <div className="absolute inset-[8%] rotate-[30deg] border-x border-aura-gold/20" />
      <div className="absolute inset-[8%] rotate-[120deg] border-x border-aura-gold/20" />
      <span className="font-display text-5xl text-aura-champagne">☼</span>
      <span className="absolute left-[12%] top-[18%] text-xl text-aura-gold">☽</span>
      <span className="absolute right-[11%] top-[30%] text-lg text-aura-champagne">♀</span>
      <span className="absolute bottom-[12%] left-[29%] text-lg text-aura-gold">♄</span>
      <span className="absolute bottom-[20%] right-[14%] text-lg text-aura-gold">♂</span>
      <span className="absolute bottom-0 text-[10px] uppercase tracking-[0.2em] text-white/45">Иллюстрация карты рождения</span>
    </div>
  );
}

export default function PremiumCalculatorHero({ eyebrow, title, description, calculator, variant }: Props) {
  return (
    <section className="premium-calculator-hero relative isolate rounded-[2rem] border border-aura-gold/25 bg-[#0e0d11] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,74,0.15),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(201,162,74,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(201,162,74,0.1)_1px,transparent_1px)] [background-size:60px_60px]" />
      <div className="premium-calculator-hero__grid relative grid items-start gap-8 px-5 py-6 sm:px-10 sm:py-10 lg:grid-cols-2 lg:px-14 lg:py-12">
        <div className="min-w-0">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-aura-gold/30 bg-aura-gold/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-champagne"><span className="text-aura-gold" aria-hidden="true">✧</span>{eyebrow}</p>
          {title}
          <p className="mt-3 max-w-xl text-base leading-relaxed text-white/70">{description}</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">{calculator}</div>
          <p className="mt-3 text-xs leading-relaxed text-white/45">18+ · Развлекательный сервис. Базовый расчёт бесплатный, полный разбор — по желанию за руны.</p>
        </div>
        <div className="premium-calculator-hero__visual relative hidden min-w-0 items-center justify-center py-6 lg:flex">
          {variant === "matrix" ? <MatrixIllustration /> : <NatalIllustration />}
        </div>
      </div>
    </section>
  );
}

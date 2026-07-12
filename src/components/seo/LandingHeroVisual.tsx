import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterAvatar from "@/components/MasterAvatar";

const HERO_SPREAD_SLOTS = [
  { key: "thoughts", label: "Его мысли" },
  { key: "feelings", label: "Её чувства" },
  { key: "advice", label: "Совет" },
] as const;

type LandingHeroVisualProps = {
  masters: ShowcaseMaster[];
};

export default function LandingHeroVisual({ masters }: LandingHeroVisualProps) {
  const featuredMasters = masters.slice(0, 3);

  return (
    <>
      <div className="aura-landing-hero__glow" aria-hidden />
      <div className="aura-landing-hero__orbit-art" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/decor/salon-orbit.svg" alt="" width={480} height={480} decoding="async" />
      </div>

      <div className="aura-landing-hero__orb max-lg:hidden" aria-hidden />
      <div className="aura-landing-hero__ring aura-landing-hero__ring--outer max-lg:hidden" aria-hidden />
      <div className="aura-landing-hero__ring aura-landing-hero__ring--inner max-lg:hidden" aria-hidden />

      <div className="aura-landing-hero__portraits max-lg:hidden" aria-hidden>
        {featuredMasters.map((m, i) => (
          <div key={m.id} className={`aura-landing-hero__portrait aura-landing-hero__portrait--${i}`}>
            <MasterAvatar masterId={m.id} masterName={m.name} size="md" priority />
          </div>
        ))}
      </div>

      <div className="aura-landing-hero__spread" aria-hidden>
        {HERO_SPREAD_SLOTS.map((slot, i) => (
          <figure
            key={slot.key}
            className={`aura-landing-hero__spread-slot aura-landing-hero__spread-slot--${i}`}
          >
            <div className="aura-landing-hero__spread-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/decor/salon-card-back.svg"
                alt=""
                width={140}
                height={220}
                decoding="async"
              />
              <div className="aura-landing-hero__spread-sheen" aria-hidden />
            </div>
            <figcaption className="aura-landing-hero__spread-label">{slot.label}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

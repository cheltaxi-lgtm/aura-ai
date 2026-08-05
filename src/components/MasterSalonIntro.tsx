import Link from "next/link";
import MasterAvatar from "@/components/MasterAvatar";
import { getCharacterById } from "@/lib/characters";
import { masterTagline } from "@/data/master-avatars";
import { MASTER_PUBLIC_BADGE } from "@/lib/master-disclosure";

/** SSR salon intro for /master/[slug] — visible above the interactive HomePage shell. */
export default function MasterSalonIntro({ slug }: { slug: string }) {
  const character = getCharacterById(slug);
  if (!character) return null;

  return (
    <section
      className="border-b border-[rgba(201,162,74,0.16)] bg-[#0a0908] px-4 py-8 sm:py-10"
      aria-labelledby="master-salon-title"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
        <MasterAvatar
          masterId={character.id}
          masterName={character.name}
          size="lg"
          priority
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-aura-gold/70">
            Наставник · {MASTER_PUBLIC_BADGE}
          </p>
          <h1 id="master-salon-title" className="mt-2 font-display text-3xl font-medium text-aura-ivory sm:text-4xl">
            {character.name}
          </h1>
          <p className="mt-1 text-sm text-[rgba(237,230,218,0.55)]">{character.title}</p>
          <p className="mt-3 text-sm leading-relaxed text-[rgba(237,230,218,0.72)]">
            {masterTagline(character.id, character.title)} Специализация: {character.specialty}. Стиль:{" "}
            {character.style}.
          </p>
          <p className="mt-4 text-xs text-white/40">
            Сеанс откроется ниже. Можно также выбрать другого наставника на{" "}
            <Link href="/#наставники" className="text-aura-gold hover:underline">
              главной
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

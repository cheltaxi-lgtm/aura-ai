import type { Metadata } from "next";
import Link from "next/link";
import { CHARACTERS } from "@/lib/characters";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Мастера Zovus — ИИ-наставники в художественных образах",
  description:
    "Вероника, Эвелина, Рагнар, Агафья и Шри Радж — персональные ИИ-наставники Zovus по Таро, нумерологии, астрологии и рунам.",
  path: "/about/masters",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
  { name: "Мастера", path: "/about/masters" },
];

export default function AboutMastersPage() {
  return (
    <AboutPageShell
      title="Мастера"
      h1="Как устроены мастера Zovus"
      intro="Каждый мастер — ИИ-наставник в художественном образе со своей школой, стилем речи и специализацией. Это не публичные тарологи, а персонажи платформы."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Наши наставники">
        <ul className="space-y-4">
          {CHARACTERS.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-medium text-white">
                {c.name} — {c.title}
              </p>
              <p className="mt-1 text-sm">{c.specialty}</p>
              <Link href={`/master/${c.id}`} className="mt-2 inline-block text-sm text-aura-gold hover:underline">
                Начать сеанс →
              </Link>
            </li>
          ))}
        </ul>
      </AboutSection>
    </AboutPageShell>
  );
}

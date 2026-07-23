import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "О сервисе Zovus — персональные расклады с ИИ-наставниками",
  description:
    "Zovus — онлайн-сервис эзотерических консультаций: Таро, руны, астрология, нумерология. ИИ-наставники в художественных образах, чат после расклада.",
  path: "/about",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
];

export default function AboutPage() {
  return (
    <AboutPageShell
      title="О сервисе"
      h1="О Zovus"
      intro="Zovus — платформа персональных эзотерических консультаций с ИИ-наставниками в художественных образах. Мы помогаем задавать вопросы картам, рунам и числам — и получать структурированные ответы в чате."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Для кого">
        <p>
          Для тех, кто ищет ясность в отношениях, карьере, выборе и самопознании — без звонков,
          очередей и шаблонных текстов «на удачу».
        </p>
      </AboutSection>
      <AboutSection title="Что мы не делаем">
        <p>
          Zovus не заменяет врача, психотерапевта или юриста. Расклады — инструмент рефлексии и
          символической интерпретации, а не гарантия событий.{" "}
          <Link href="/disclaimer" className="text-aura-gold hover:underline">
            Полный отказ от ответственности
          </Link>
          .
        </p>
      </AboutSection>
      <AboutSection title="Документы">
        <ul className="space-y-2">
          <li>
            <Link href="/about/methodology" className="text-aura-gold hover:underline">
              Методика раскладов
            </Link>
          </li>
          <li>
            <Link href="/about/how-readings-work" className="text-aura-gold hover:underline">
              Как проходит расклад
            </Link>
          </li>
          <li>
            <Link href="/about/masters" className="text-aura-gold hover:underline">
              О мастерах
            </Link>
          </li>
          <li>
            <Link href="/about/personal-memory" className="text-aura-gold hover:underline">
              Персональная память
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-aura-gold hover:underline">
              Политика ПДн
            </Link>
          </li>
        </ul>
      </AboutSection>
    </AboutPageShell>
  );
}

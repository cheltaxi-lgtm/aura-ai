import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Ограничения интерпретации — важно знать перед раскладом",
  description:
    "Расклад Таро не гарантирует результат, не заменяет терапию и не является юридическим советом.",
  path: "/about/limitations",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
  { name: "Ограничения", path: "/about/limitations" },
];

export default function LimitationsPage() {
  return (
    <AboutPageShell
      title="Ограничения"
      h1="Как интерпретировать ответы"
      intro="Расклад — символическая карта ситуации, а не приговор и не инструкция к действию без вашего выбора."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Не гарантия">
        <p>Карты показывают тенденции и энергию момента. События зависят от людей, а не только от символов.</p>
      </AboutSection>
      <AboutSection title="Не медицина и не право">
        <p>
          При проблемах со здоровьем или юридических спорах обращайтесь к профильным специалистам.
        </p>
      </AboutSection>
      <AboutSection title="Ваш выбор">
        <p>
          Трактовка — повод для размышления. Решения остаются за вами; Zovus не несёт ответственности
          за действия, принятые на основе расклада.
        </p>
      </AboutSection>
    </AboutPageShell>
  );
}

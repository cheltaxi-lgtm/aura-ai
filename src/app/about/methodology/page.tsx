import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Как работают расклады Zovus — методика и ограничения",
  description:
    "Как формируются трактовки, кто «мастера», как выбирается схема расклада и в каких случаях интерпретация не является гарантией.",
  path: "/about/methodology",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
  { name: "Методика", path: "/about/methodology" },
];

export default function MethodologyPage() {
  return (
    <AboutPageShell
      title="Методика"
      h1="Как работают расклады Zovus"
      intro="Мы сочетаем классические схемы Таро, рун и нумерологии с диалогом ИИ-мастера — художественного образа, который ведёт сеанс в выбранной традиции."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Выбор схемы">
        <p>
          Каждый вопрос на сайте привязан к проверенной схеме расклада — число карт, позиции и
          логика трактовки. Мастер не «угадывает», а связывает выпавшие символы с вашим вопросом.
        </p>
      </AboutSection>
      <AboutSection title="Роль мастера">
        <p>
          Мастера Zovus — ИИ-наставники в художественных образах (Таро, руны, астрология и др.).
          Это не публичные лица и не живые тарологи; образ задаёт стиль и школу интерпретации.
        </p>
      </AboutSection>
      <AboutSection title="Память сессии">
        <p>
          После регистрации мастер учитывает контекст прошлых сеансов — вы можете уточнять и
          продолжать диалог без повторения вводных.
        </p>
      </AboutSection>
      <AboutSection title="Ограничения">
        <p>
          Интерпретация не является предсказанием с точной датой, медицинским диагнозом или
          юридическим советом. Подробнее — в разделе{" "}
          <a href="/about/limitations" className="text-aura-gold hover:underline">
            ограничения интерпретации
          </a>
          .
        </p>
      </AboutSection>
    </AboutPageShell>
  );
}

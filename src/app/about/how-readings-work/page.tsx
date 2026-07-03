import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Как проходит расклад на Zovus — пошагово",
  description: "Выбор вопроса, схема карт, расшифровка и чат с мастером — четыре шага персонального расклада.",
  path: "/about/how-readings-work",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
  { name: "Как проходит расклад", path: "/about/how-readings-work" },
];

export default function HowReadingsWorkPage() {
  return (
    <AboutPageShell
      title="Процесс"
      h1="Как проходит расклад"
      intro="От выбора вопроса до уточняющего диалога — весь путь занимает несколько минут."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="1. Выбор вопроса">
        <p>Выберите готовый вопрос в каталоге или сформулируйте свой — мы подберём схему и мастера.</p>
      </AboutSection>
      <AboutSection title="2. Расклад карт">
        <p>Мастер раскладывает карты по выбранной схеме — позиции соответствуют аспектам вашего вопроса.</p>
      </AboutSection>
      <AboutSection title="3. Расшифровка">
        <p>Вы получаете связный текст: что означает каждая позиция и как это складывается в ответ.</p>
      </AboutSection>
      <AboutSection title="4. Диалог">
        <p>Можно задать уточняющие вопросы в чате — мастер помнит контекст сеанса.</p>
      </AboutSection>
    </AboutPageShell>
  );
}

import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Конфиденциальность на Zovus — что хранится и как удалить",
  description:
    "Как Zovus обрабатывает данные сеансов, что видит мастер и как удалить историю из личного кабинета.",
  path: "/about/privacy-practices",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "О сервисе", path: "/about" },
  { name: "Конфиденциальность", path: "/about/privacy-practices" },
];

export default function PrivacyPracticesPage() {
  return (
    <AboutPageShell
      title="Конфиденциальность"
      h1="Безопасность и конфиденциальность"
      intro="Вопросы о любви и личной жизни требуют доверия. Мы минимизируем сбор данных и даём контроль над историей."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Что хранится">
        <p>
          Переписка с мастерами, расклады и настройки профиля — в вашем аккаунте. Мы не публикуем
          содержание сеансов и не индексируем личные страницы кабинета.
        </p>
      </AboutSection>
      <AboutSection title="Удаление данных">
        <p>
          Вы можете обратиться по email из{" "}
          <a href="/privacy" className="text-aura-gold hover:underline">
            политики ПДн
          </a>{" "}
          для удаления аккаунта и связанных данных.
        </p>
      </AboutSection>
      <AboutSection title="Платежи">
        <p>Данные карт обрабатывает платёжный провайдер; Zovus не хранит реквизиты банковских карт.</p>
      </AboutSection>
    </AboutPageShell>
  );
}

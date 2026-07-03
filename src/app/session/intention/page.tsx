import { Suspense } from "react";
import SessionIntentionScreen from "@/components/session/SessionIntentionScreen";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata = buildSeoMetadata({
  title: "Намерение сеанса | Zovus",
  description: "Выберите тему расклада перед началом чата с мастером.",
  path: "/session/intention",
});

export default function SessionIntentionPage() {
  return (
    <Suspense fallback={<div className="px-4 py-16 text-center text-sm text-gray-400">Загрузка…</div>}>
      <SessionIntentionScreen />
    </Suspense>
  );
}

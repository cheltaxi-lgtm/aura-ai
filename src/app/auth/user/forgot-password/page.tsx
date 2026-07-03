import { Suspense } from "react";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata = buildSeoMetadata({
  title: "Сброс пароля | Zovus",
  description: "Восстановление доступа к аккаунту Zovus.",
  path: "/auth/user/forgot-password",
});

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">Загрузка…</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

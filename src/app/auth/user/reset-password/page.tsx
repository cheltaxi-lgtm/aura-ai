import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata = buildSeoMetadata({
  title: "Новый пароль | Zovus",
  description: "Установка нового пароля Zovus.",
  path: "/auth/user/reset-password",
});

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">Загрузка…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

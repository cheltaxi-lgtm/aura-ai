import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell, { AuthSalonHeader } from "@/components/auth/AuthShell";

export default function UserLoginPage() {
  return (
    <AuthShell
      backSlot={
        <Link href="/auth">← Выбор аккаунта</Link>
      }
    >
      <AuthSalonHeader
        overline="Приватный цифровой салон"
        title="С возвращением"
        subtitle="Ваши расклады, диалоги и личная история — здесь"
      />
      <AuthForm mode="login" role="user" />
    </AuthShell>
  );
}

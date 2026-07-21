import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell, { AuthSalonHeader } from "@/components/auth/AuthShell";

export default function UserRegisterPage() {
  return (
    <AuthShell
      backSlot={
        <Link href="/auth">← Выбор аккаунта</Link>
      }
    >
      <AuthSalonHeader
        overline="Приватный цифровой салон"
        title="Добро пожаловать в салон"
        subtitle="Создайте аккаунт — сохраним расклады и диалоги с наставниками"
      />
      <AuthForm mode="register" role="user" />
    </AuthShell>
  );
}

import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell, { AuthSalonHeader } from "@/components/auth/AuthShell";
import AuthSessionResume from "@/components/auth/AuthSessionResume";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

export default function UserRegisterPage() {
  return (
    <AuthShell
      backSlot={
        <Link href="/auth">← Выбор аккаунта</Link>
      }
    >
      <AuthSessionResume role="user" fallback="/cabinet" />
      <AuthSalonHeader
        overline="Приватный цифровой салон"
        title="Добро пожаловать в салон"
        subtitle="Создайте аккаунт — сохраним расклады и диалоги с наставниками"
      />
      {/* Main registration value: server-confirmed starter package (renders only
          when /api/runes/config loaded — never shows fallback numbers). */}
      <StarterRunesValue variant="hero" className="mb-5" />
      <AuthForm mode="register" role="user" />
    </AuthShell>
  );
}

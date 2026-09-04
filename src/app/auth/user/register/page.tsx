import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell, { AuthSalonHeader } from "@/components/auth/AuthShell";
import AuthSessionResume from "@/components/auth/AuthSessionResume";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

export default function UserRegisterPage() {
  return (
    <AuthShell
      className="auth-salon-page--register"
      backSlot={
        <Link href="/auth">← Выбор аккаунта</Link>
      }
    >
      <AuthSessionResume role="user" fallback="/cabinet" compact />
      <AuthSalonHeader
        overline=""
        title="Сохраните свой разбор"
        subtitle="Аккаунт сохранит результаты и позволит продолжить диалог."
      />
      {/* Main registration value: server-confirmed starter package (renders only
          when /api/runes/config loaded — never shows fallback numbers). */}
      <div className="mb-3 min-h-[54px] text-center">
        <StarterRunesValue variant="badge" generic />
      </div>
      <AuthForm mode="register" role="user" />
    </AuthShell>
  );
}

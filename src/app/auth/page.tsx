import Link from "next/link";
import { Sparkles, User } from "lucide-react";

export default function AuthPortalPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="mb-10 font-display text-2xl text-white neon-text">
        Aura
      </Link>

      <h1 className="font-display mb-2 text-3xl font-bold text-white">Вход в платформу</h1>
      <p className="mb-10 text-gray-500">Выберите тип аккаунта</p>

      <div className="grid w-full max-w-lg gap-6 sm:grid-cols-2">
        <Link
          href="/auth/user/login"
          className="glass-panel group p-8 text-center transition-all hover:border-aura-purple/50 hover:shadow-neon"
        >
          <User className="mx-auto mb-4 h-12 w-12 text-aura-purple transition-transform group-hover:scale-110" />
          <h2 className="font-display mb-2 text-xl text-white">Клиент</h2>
          <p className="text-sm text-gray-500">История сеансов, подписка, оплаты</p>
          <p className="mt-4 text-xs text-aura-neon">Войти / Регистрация →</p>
        </Link>

        <Link
          href="/auth/expert/login"
          className="glass-panel group p-8 text-center transition-all hover:border-aura-gold/50 hover:shadow-neon-gold"
        >
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-aura-gold transition-transform group-hover:scale-110" />
          <h2 className="font-display mb-2 text-xl text-white">Эзотерик</h2>
          <p className="text-sm text-gray-500">Своя страница, white-label, доход 80%</p>
          <p className="mt-4 text-xs text-aura-gold">Войти / Регистрация →</p>
        </Link>
      </div>
    </div>
  );
}

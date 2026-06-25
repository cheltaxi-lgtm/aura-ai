import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function UserLoginPage() {
  return (
    <div className="min-h-screen px-6 py-16">
      <Link href="/auth" className="mb-8 inline-block text-sm text-gray-500 hover:text-aura-neon">
        ← Выбор аккаунта
      </Link>
      <h1 className="font-display mb-2 text-center text-3xl text-white">Вход</h1>
      <p className="mb-8 text-center text-sm text-aura-ivory/45">Личный кабинет Искателя</p>
      <AuthForm mode="login" role="user" />
    </div>
  );
}

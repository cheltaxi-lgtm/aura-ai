import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function UserRegisterPage() {
  return (
    <div className="min-h-screen px-6 py-16">
      <Link href="/auth" className="mb-8 inline-block text-sm text-gray-500 hover:text-aura-neon">
        ← Выбор аккаунта
      </Link>
      <h1 className="font-display mb-2 text-center text-3xl text-white">Создать профиль</h1>
      <p className="mb-8 text-center text-sm text-aura-ivory/45">
        Дата рождения и ваш вопрос — чтобы мастера точнее подсказали путь
      </p>
      <AuthForm mode="register" role="user" />
    </div>
  );
}

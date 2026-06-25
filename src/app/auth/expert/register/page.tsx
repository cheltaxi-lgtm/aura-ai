import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { isExpertRegistrationEnabled } from "@/lib/settings";

export default async function ExpertRegisterPage() {
  if (!(await isExpertRegistrationEnabled())) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen px-6 py-16">
      <Link href="/auth" className="mb-8 inline-block text-sm text-gray-500 hover:text-aura-neon">
        ← Выбор аккаунта
      </Link>
      <h1 className="font-display mb-2 text-center text-3xl text-white">Стать мастером</h1>
      <p className="mb-8 text-center text-sm text-aura-ivory/45">Своя страница · кабинет · сплит 80/20</p>
      <AuthForm mode="register" role="expert" />
    </div>
  );
}

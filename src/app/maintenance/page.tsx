import Link from "next/link";
import MaintenanceAutoRedirect from "@/components/MaintenanceAutoRedirect";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = {
  title: `Технические работы — ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-white">
      <MaintenanceAutoRedirect />
      <div className="glass-panel max-w-md space-y-4 p-8">
        <p className="text-sm font-medium text-aura-gold">Короткая пауза</p>
        <h1 className="font-display text-2xl text-aura-ivory">Сервис на обслуживании</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          Мы обновляем {BRAND_NAME}. Обычно это занимает несколько минут — загляните чуть позже.
        </p>
        <Link href="/maintenance" className="btn-neon inline-block px-6 py-2.5 text-sm">
          Обновить
        </Link>
      </div>
    </main>
  );
}

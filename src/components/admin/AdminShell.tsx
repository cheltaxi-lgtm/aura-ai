"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  CreditCard,
  MessageSquare,
  Settings,
  ScrollText,
  Share2,
  LogOut,
  Brain,
  Coins,
  Headphones,
  Mail,
  Menu,
  X,
  Flame,
  HeartHandshake,
  Database,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/experts", label: "Эзотерики", icon: Sparkles },
  { href: "/admin/influencers", label: "Блогеры", icon: Share2 },
  { href: "/admin/payments", label: "Платежи", icon: CreditCard },
  { href: "/admin/runes", label: "Руны", icon: Coins },
  { href: "/admin/rituals", label: "Обряды", icon: Flame },
  { href: "/admin/joint-readings", label: "Совместные расклады", icon: HeartHandshake },
  { href: "/admin/memory", label: "Память", icon: Database },
  { href: "/admin/sessions", label: "Сессии и чат", icon: MessageSquare },
  { href: "/admin/support", label: "Поддержка", icon: Headphones },
  { href: "/admin/email", label: "Почта", icon: Mail },
  { href: "/admin/ai", label: "Модели и промпты", icon: Brain },
  { href: "/admin/settings", label: "Платформа", icon: Settings },
  { href: "/admin/audit", label: "Аудит", icon: ScrollText },
];

function AdminNavLinks({
  pathname,
  onNavigate,
  className = "space-y-1",
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={className}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-aura-purple/20 text-aura-neon"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<{ email: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user?.role === "admin") {
          setAdmin({ email: d.user.email, name: d.user.name });
        } else {
          router.replace("/admin/login");
        }
      })
      .catch(() => router.replace("/admin/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const logout = async () => {
    const { performClientLogout } = await import("@/lib/client-logout");
    await performClientLogout({ redirectTo: "/admin/login", hardRedirect: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Загрузка админки...
      </div>
    );
  }

  if (!admin) return null;

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-3 backdrop-blur md:hidden">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-aura-neon">Zovus Admin</p>
          <p className="truncate text-[10px] text-gray-600">{admin.email}</p>
        </div>
        <button
          type="button"
          aria-label={mobileNavOpen ? "Закрыть меню" : "Открыть меню"}
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-xl border border-white/10 p-2 text-gray-300 hover:bg-white/5 hover:text-white"
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobileNav}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/5 bg-[#0a0a10] p-4 transition-transform duration-200 md:hidden ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 px-2">
          <p className="font-display text-lg font-bold text-aura-neon">Zovus Admin</p>
          <p className="truncate text-xs text-gray-600">{admin.email}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AdminNavLinks pathname={pathname} onNavigate={closeMobileNav} />
        </div>
        <button
          onClick={() => {
            closeMobileNav();
            void logout();
          }}
          className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-white/5 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </aside>

      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-black/30 p-4 md:block">
          <div className="mb-8 px-2">
            <p className="font-display text-lg font-bold text-aura-neon">Zovus Admin</p>
            <p className="truncate text-xs text-gray-600">{admin.email}</p>
          </div>
          <AdminNavLinks pathname={pathname} />
          <button
            onClick={logout}
            className="mt-8 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-white/5 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </aside>

        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-2xl font-bold text-white md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

export function AdminTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="glass-panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-gray-600">
                Нет данных
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-gray-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="glass-panel p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-display mt-1 text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}

export function AdminBtn({
  children,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        variant === "danger"
          ? "border border-red-500/40 text-red-400 hover:bg-red-500/10"
          : "border border-aura-purple/40 text-aura-neon hover:bg-aura-purple/10"
      }`}
    >
      {children}
    </button>
  );
}

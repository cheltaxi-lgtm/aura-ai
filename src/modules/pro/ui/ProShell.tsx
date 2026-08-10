"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/pro", label: "Обзор" },
  { href: "/pro/clients", label: "Клиенты" },
  { href: "/pro/case/new", label: "Практика" },
  { href: "/pro/landing", label: "Лендинг" },
  { href: "/pro/inbox", label: "Входящие" },
  { href: "/pro/avito", label: "Avito" },
  { href: "/pro/billing", label: "Биллинг" },
  { href: "/pro/settings", label: "Настройки" },
];

export default function ProShell({
  children,
  title,
  /** gate = apply/login/pending — no cabinet nav */
  variant = "cabinet",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: "cabinet" | "gate";
}) {
  const pathname = usePathname();
  const isGate = variant === "gate";

  return (
    <div
      className={
        isGate
          ? "pro-shell pro-shell--gate"
          : "pro-shell mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"
      }
    >
      {isGate ? (
        <div className="pro-gate">
          <div className="pro-gate__vignette" aria-hidden />
          <div className="pro-gate__inner">
            <p className="pro-gate__brand">
              <span>Zovus</span> Pro
            </p>
            {title ? <h1 className="pro-gate__title">{title}</h1> : null}
            {children}
          </div>
        </div>
      ) : (
        <>
          <header className="pro-shell__header mb-8 pb-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="pro-shell__eyebrow">Zovus Pro</p>
                <h1 className="pro-shell__title mt-1 text-2xl sm:text-3xl">
                  {title || "Кабинет практика"}
                </h1>
              </div>
              <Link
                href="/zovus-pro"
                className="text-xs text-[var(--pro-faint)] transition-colors hover:text-[var(--pro-accent-light)]"
              >
                О Pro
              </Link>
            </div>
            <nav
              className="pro-shell__nav mt-5 flex flex-wrap gap-1"
              aria-label="Разделы Pro"
            >
              {NAV.map((item) => {
                const active =
                  item.href === "/pro"
                    ? pathname === "/pro"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "pro-shell__nav-pill pro-shell__nav-pill--active"
                        : "pro-shell__nav-pill"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          {children}
        </>
      )}
    </div>
  );
}

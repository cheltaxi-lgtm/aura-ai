import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { BRAND_LOGO_BREADCRUMB } from "@/lib/brand";

export function SeoPageShell({
  children,
  backHref = "/",
  backLabel = "На главную",
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 pb-16 text-white sm:py-12">
      <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm text-white/50">
        <BrandLogo {...BRAND_LOGO_BREADCRUMB} />
        <span aria-hidden>·</span>
        <Link href={backHref} className="transition hover:text-aura-gold">
          {backLabel}
        </Link>
      </nav>
      {children}
    </main>
  );
}

export function SeoCtaButton({
  href,
  children,
  variant = "gold",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "gold" | "ghost";
}) {
  const cls =
    variant === "gold"
      ? "btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
      : "btn-luxe btn-luxe--md btn-luxe--ghost inline-flex";
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function SeoSection({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-10" id={id}>
      <h2 className="font-display text-lg text-aura-gold">{title}</h2>
      <div className="mt-4 space-y-3 text-white/75">{children}</div>
    </section>
  );
}

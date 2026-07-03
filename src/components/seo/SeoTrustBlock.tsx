import Link from "next/link";

/** Trust micro-block for money pages — under primary CTA. */
export default function SeoTrustBlock() {
  return (
    <aside
      className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55"
      aria-label="Надёжность сервиса"
    >
      <p>
        Конфиденциально · История в личном кабинете · Не заменяет медицинскую или юридическую
        консультацию ·{" "}
        <Link href="/about/methodology" className="text-aura-gold hover:underline">
          Как работают расклады
        </Link>
        {" · "}
        <Link href="/about/limitations" className="text-aura-gold hover:underline">
          Ограничения интерпретации
        </Link>
      </p>
    </aside>
  );
}

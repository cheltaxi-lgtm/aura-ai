"use client";

import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { shouldUseAppShellClient } from "@/lib/app-shell";

export default function CabinetHumanDesign() {
  const [chartCount, setChartCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/human-design/mine", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.enabled === false) return;
        setChartCount(Array.isArray(d?.charts) ? d.charts.length : 0);
      })
      .catch(() => setChartCount(0));
  }, []);

  if (chartCount === null) return null;

  const open = () => {
    const target = shouldUseAppShellClient()
      ? "/cabinet/human-design?app=1"
      : "/cabinet/human-design";
    window.location.assign(target);
  };

  return (
    <section className="ritual-cta-banner" aria-labelledby="cabinet-hd-title">
      <div className="ritual-cta-banner__inner">
        <span className="ritual-cta-banner__icon" aria-hidden>
          <Sun className="h-6 w-6 text-amber-200" strokeWidth={1.5} />
        </span>
        <div className="ritual-cta-banner__copy">
          <h2 id="cabinet-hd-title" className="text-base font-semibold text-white">
            Дизайн Человека
          </h2>
          <p className="mt-1 text-sm text-white/60">
            {chartCount > 0
              ? `Ваших карт: ${chartCount}. Бодиграф, разбор Эвелины и вопросы — в разделе.`
              : "Рассчитайте бодиграф: тип, стратегия, авторитет и профиль по точным эфемеридам."}
          </p>
        </div>
        <button
          type="button"
          onClick={open}
          className="btn-luxe btn-luxe--gold btn-luxe--sm shrink-0"
        >
          {chartCount > 0 ? "Открыть" : "Рассчитать"}
        </button>
      </div>
    </section>
  );
}

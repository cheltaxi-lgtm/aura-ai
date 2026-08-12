"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type TrialState = {
  tier: string;
  enforced: boolean;
  trialEndsAt: string | null;
  trialRunes: number;
  spentRunes: number;
  runesLeft: number | null;
  daysLeft: number | null;
  blocked: boolean;
  blockReason: "expired" | "runes_exhausted" | null;
};

export default function ProBillingPage() {
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pro/account", { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        setData(await res.json());
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  const trial = (data?.trial ?? null) as TrialState | null;
  const isTrial = trial?.tier === "free_trial";

  return (
    <ProShell title="Биллинг">
      {loadError ? (
        <p className="pro-panel mb-4 text-sm text-red-300" role="alert">
          Не удалось загрузить данные биллинга. Обновите страницу.
        </p>
      ) : null}

      {isTrial && trial ? (
        <div
          className={`pro-panel mb-5 text-sm ${
            trial.blocked ? "text-red-200" : "text-[var(--pro-text,#ede6da)]"
          }`}
        >
          <p className="font-medium">
            {trial.blocked
              ? trial.blockReason === "expired"
                ? "Пробный период завершён"
                : "Руны пробного периода исчерпаны"
              : "Пробный период активен"}
          </p>
          <p className="mt-1 text-xs text-[var(--pro-faint,#888)]">
            {trial.runesLeft !== null && (
              <>
                Осталось рун:{" "}
                <span className="text-aura-champagne">{trial.runesLeft}</span>
                {" · "}
              </>
            )}
            {trial.daysLeft !== null && (
              <>
                Дней до конца:{" "}
                <span className="text-aura-champagne">{trial.daysLeft}</span>
              </>
            )}
          </p>
          {trial.blocked ? (
            <p className="mt-2 text-xs">
              Чтобы продолжить работу, свяжитесь с администратором для перехода
              на тариф Pro.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-gray-300">
        Режим: <strong>{data?.billingMode || "—"}</strong>. В shadow ledger не
        меняется; в live списания идут через общий рунный баланс.
      </p>
      <p className="mt-4 font-display text-3xl text-[#e8c77e]">
        {data?.runeBalance ?? "—"} ᚢ
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Shadow usage: {data?.usage?.shadowRunes ?? 0} · Live:{" "}
        {data?.usage?.liveRunes ?? 0}
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Расход на ИИ по кейсам (оценка по каталогу OpenRouter):{" "}
        <span className="text-gray-300">
          ≈ {Number(data?.aiCostRubTotal ?? 0).toFixed(2)} ₽
        </span>
      </p>
      <Link href="/cabinet?tab=runes" className="btn-neon mt-6 inline-block px-4 py-2 text-sm">
        Купить пакет рун
      </Link>
    </ProShell>
  );
}

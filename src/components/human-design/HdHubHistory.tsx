"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { TYPE_META } from "@/lib/human-design";
import type { HdChartPayload } from "./HdChartView";
import { hdChartChipLabel } from "./hd-labels";
import { HD_LAST_FINGERPRINT_KEY } from "./hd-claim";
import { claimAllPendingHdCharts } from "./hd-claim";

type SavedChart = HdChartPayload & { createdAt?: string };
type HistoryState =
  | { status: "loading" }
  | { status: "guest"; hasRecent: boolean }
  | { status: "ready"; charts: SavedChart[]; hasRecent: boolean }
  | { status: "error" };

function hasRecentGuestChart(): boolean {
  try {
    return Boolean(localStorage.getItem(HD_LAST_FINGERPRINT_KEY));
  } catch {
    return false;
  }
}

export default function HdHubHistory() {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const auth = await fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal });
      if (!auth.ok && auth.status !== 401) throw new Error("session unavailable");
      const session = auth.ok ? await auth.json() : null;
      if (!session?.authenticated || session.needsProfile) {
        if (!signal.aborted) {
          setState({ status: "guest", hasRecent: hasRecentGuestChart() });
        }
        return;
      }
      // A guest may land on the hub directly after sign-in. Adopt their chart
      // before loading the archive, just as the calculator and cabinet do.
      await claimAllPendingHdCharts();
      if (signal.aborted) return;
      const response = await fetch("/api/human-design/mine", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("history unavailable");
      const data = await response.json();
      if (!Array.isArray(data?.charts)) throw new Error("invalid history");
      if (!signal.aborted) setState({
        status: "ready",
        charts: data.charts as SavedChart[],
        hasRecent: hasRecentGuestChart(),
      });
    } catch {
      if (!signal.aborted) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  return (
    <section id="hd-my-charts" className="hd-hub-history scroll-mt-24" aria-labelledby="hd-my-charts-title">
      <div className="hd-hub-heading">
        <div>
          <p className="hd-hub-eyebrow">Вернуться к себе</p>
          <h2 id="hd-my-charts-title">Мои карты</h2>
          <p>Ваш результат всегда под рукой — продолжайте изучать его в удобное время.</p>
        </div>
        <Link href="/dizayn-cheloveka/rasschitat" className="hd-hub-text-link">
          Новый расчёт <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {state.status === "loading" && <p className="hd-hub-history__state" role="status">Загружаем карты…</p>}
      {state.status === "error" && (
        <div className="hd-hub-history__state" role="alert">
          <p>Не удалось загрузить карты. Попробуйте ещё раз.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            <RotateCcw size={14} aria-hidden="true" /> Повторить
          </button>
        </div>
      )}
      {state.status === "guest" && (
        <div className="hd-hub-history__state">
          {state.hasRecent ? (
            <>
              <p>В этом браузере есть недавний расчёт.</p>
              <Link href="/dizayn-cheloveka/rasschitat">Открыть последний бодиграф <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </>
          ) : (
            <>
              <p>Здесь появятся ваши сохранённые карты. Расчёт бесплатный и доступен без регистрации.</p>
              <Link href="/dizayn-cheloveka/rasschitat">Рассчитать первую карту <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </>
          )}
        </div>
      )}
      {state.status === "ready" && (state.charts.length ? (
        <div className="hd-hub-history__grid">
          {state.charts.slice(0, 3).map((item) => (
            <Link key={item.id} href={`/cabinet/human-design?chart=${encodeURIComponent(item.id)}`} className="hd-hub-history__chart">
              <span className="hd-hub-history__chart-label">{item.subjectKind === "other" ? "Карта другого человека" : "Мой бодиграф"}</span>
              <strong>{hdChartChipLabel(item)}</strong>
              <span>{TYPE_META[item.chart.type]?.nameRu ?? "Дизайн Человека"} · профиль {item.chart.profile}</span>
              <span className="hd-hub-history__open">Открыть карту <ArrowUpRight size={15} aria-hidden="true" /></span>
            </Link>
          ))}
          {state.charts.length > 3 && (
            <Link href="/cabinet/human-design" className="hd-hub-history__all">Все карты ({state.charts.length}) <ArrowUpRight size={15} aria-hidden="true" /></Link>
          )}
        </div>
      ) : (
        <div className="hd-hub-history__state">
          <p>{state.hasRecent
            ? "В этом браузере есть недавний расчёт. Откройте его, чтобы продолжить и сохранить в аккаунте."
            : "Пока нет сохранённых карт. Постройте свой бодиграф и возвращайтесь к нему здесь."}</p>
          <Link href="/dizayn-cheloveka/rasschitat">
            {state.hasRecent ? "Открыть недавний бодиграф" : "Рассчитать первую карту"} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      ))}
    </section>
  );
}

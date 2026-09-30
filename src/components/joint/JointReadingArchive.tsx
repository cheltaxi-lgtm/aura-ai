"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { buildLoginHref } from "@/lib/post-auth-return";

type JointItem = {
  token: string;
  status: string;
  intentTitle: string;
  initiatorName: string | null;
  partnerName: string | null;
  hasInitiatorReading: boolean;
  hasPartnerReading: boolean;
  hasCombined: boolean;
  createdAt: string;
  isInitiator: boolean;
};

function statusLabel(item: JointItem) {
  if (item.hasCombined) return "Готово";
  if (item.status === "expired") return "Ссылка истекла";
  const ownDone = item.isInitiator ? item.hasInitiatorReading : item.hasPartnerReading;
  const otherDone = item.isInitiator ? item.hasPartnerReading : item.hasInitiatorReading;
  if (!ownDone && otherDone) return "Ваш ход";
  if (ownDone && !otherDone) return "Ждём второго";
  if (ownDone && otherDone) return "Готовим итог";
  return "Ожидаем расклады";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function JointReadingArchive() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [items, setItems] = useState<JointItem[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setError(false);
    try {
      const response = await fetch("/api/joint-reading/mine", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("archive unavailable");
      const body = (await response.json()) as { items?: JointItem[]; nextOffset?: number | null };
      if (!Array.isArray(body.items)) throw new Error("invalid archive");
      if (!signal.aborted) {
        setItems(body.items);
        setNextOffset(typeof body.nextOffset === "number" ? body.nextOffset : null);
        setMoreError(false);
      }
    } catch {
      if (!signal.aborted) setError(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setItems(null);
      setNextOffset(null);
      setError(false);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [authLoading, isLoggedIn, load, refresh]);

  useEffect(() => {
    const onCreated = () => setRefresh((value) => value + 1);
    window.addEventListener("joint-reading:created", onCreated);
    return () => window.removeEventListener("joint-reading:created", onCreated);
  }, []);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const response = await fetch(`/api/joint-reading/mine?offset=${nextOffset}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("archive unavailable");
      const body = (await response.json()) as { items?: JointItem[]; nextOffset?: number | null };
      if (!Array.isArray(body.items)) throw new Error("invalid archive");
      setItems((previous) => {
        const known = new Set((previous ?? []).map((item) => item.token));
        return [...(previous ?? []), ...body.items!.filter((item) => !known.has(item.token))];
      });
      setNextOffset(typeof body.nextOffset === "number" ? body.nextOffset : null);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const renderItem = (item: JointItem) => {
    const ownDone = item.isInitiator ? item.hasInitiatorReading : item.hasPartnerReading;
    const otherDone = item.isInitiator ? item.hasPartnerReading : item.hasInitiatorReading;
    const label = item.hasCombined ? "Читать общий результат" : item.status === "expired" ? "Открыть запись" : "Открыть приглашение";
    return (
      <li key={item.token} className="joint-archive__item">
        <Link href={`/joint-reading/${encodeURIComponent(item.token)}`} className="joint-archive__link">
          <span className="joint-archive__icon" aria-hidden="true"><Users size={19} strokeWidth={1.5} /></span>
          <span className="joint-archive__item-body">
            <span className="joint-archive__names">
              {item.initiatorName?.trim() || "Первый участник"} и {item.partnerName?.trim() || "второй участник"}
            </span>
            <span className="joint-archive__meta">{item.intentTitle} · {formatDate(item.createdAt)}</span>
            <span className="joint-archive__progress">
              {item.hasCombined ? "Общая интерпретация готова" : `Ваш расклад ${ownDone ? "готов" : "ожидается"} · Второй ${otherDone ? "готов" : "ожидается"}`}
            </span>
            <span className="joint-archive__action">{label} <ArrowUpRight size={13} aria-hidden="true" /></span>
          </span>
          <span className={`joint-archive__status joint-archive__status--${item.status}`}>
            {statusLabel(item)}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <section id="joint-history" className="joint-archive scroll-mt-24" aria-labelledby="joint-history-title">
      <div className="joint-archive__heading">
        <span className="joint-eyebrow">Ваше пространство</span>
        <h2 id="joint-history-title">Мои совместные расклады</h2>
        <p>Возвращайтесь к приглашениям и готовым результатам здесь.</p>
      </div>
      {authLoading ? (
        <p className="joint-archive__state" role="status">Проверяем историю…</p>
      ) : !isLoggedIn ? (
        <div className="joint-archive__state">
          <p>Войдите, чтобы увидеть свои приглашения и результаты.</p>
          <Link href={buildLoginHref("/joint-reading#joint-history")}>Войти и посмотреть <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
      ) : error && items === null ? (
        <div className="joint-archive__state" role="alert">
          <p>Не удалось загрузить историю.</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>Повторить</button>
        </div>
      ) : items === null ? (
        <p className="joint-archive__state" role="status">Загружаем историю…</p>
      ) : (
        <>
          {error && (
            <div className="joint-archive__warning" role="alert">
              <span>Не удалось обновить историю.</span>
              <button type="button" onClick={() => setRefresh((value) => value + 1)}>Повторить</button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="joint-archive__state">Здесь появится первый совместный расклад. Создайте приглашение и отправьте ссылку второму участнику.</p>
          ) : (
            <>
              <ul className="joint-archive__list">{items.slice(0, 3).map(renderItem)}</ul>
              {items.length > 3 && (
                <details className="joint-archive__more">
                  <summary>Показать загруженные · {items.length}{nextOffset !== null ? "+" : ""}</summary>
                  <ul className="joint-archive__list">{items.slice(3).map(renderItem)}</ul>
                  {nextOffset !== null && (
                    <button type="button" className="joint-archive__load-more" disabled={loadingMore} onClick={() => void loadMore()}>
                      {loadingMore ? "Загружаем…" : "Загрузить ещё"}
                    </button>
                  )}
                  {moreError && <p className="joint-archive__more-error" role="alert">Не удалось загрузить следующие записи. Повторите попытку.</p>}
                </details>
              )}
            </>
          )}
        </>
      )}
      <p className="joint-archive__note">Ссылка для второго участника действует 14 дней. Готовый результат остаётся в истории аккаунта.</p>
    </section>
  );
}

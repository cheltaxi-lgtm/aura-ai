"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Loader2, Trash2, Users } from "lucide-react";
import {
  setJointReadingToken,
  setJointReadingRole,
  setJointReadingIntentSlug,
} from "@/lib/joint-reading-storage";
import { buildJointSpreadStartPath } from "@/lib/joint-reading-nav";
import { withAppShellIfNeeded } from "@/lib/post-auth-return";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import JointPersonalReading from "@/components/joint/JointPersonalReading";
import { getSpread } from "@/lib/spreads";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import ShareButton from "@/components/share/ShareButton";
import NatalSynastryWheel from "@/components/natal/NatalSynastryWheel";
import CompositeWheel from "@/components/natal/CompositeWheel";
import type { CompositeChart } from "@/lib/natal/composite";
import type { SynastryDimension } from "@/lib/natal/synastry";
import { jointReadingToSharePayload } from "@/lib/share/payload-builders";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import {
  buildLoginHref,
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { trackRegistrationCtaClick } from "@/lib/seo/metrika";

type JointPayload = {
  token: string;
  status: string;
  spreadId: string;
  intentSlug: string;
  initiatorName: string | null;
  partnerName: string | null;
  expiresAt: string;
  hasInitiatorReading: boolean;
  hasPartnerReading: boolean;
  combinedReading: string | null;
  combinedPending?: boolean;
  combinedJobId?: string | null;
  initiatorReading: string | null;
  initiatorCards?: { name: string; position?: string }[];
  partnerReading: string | null;
  partnerCards?: { name: string; position?: string }[];
  viewerRole: "initiator" | "partner" | "guest" | null;
  canStartAsInitiator: boolean;
  canStartAsPartner: boolean;
  isLoggedIn: boolean;
  synastry?: {
    overallScore?: number;
    dimensions?: SynastryDimension[];
    highlights?: string[];
    crossAspects?: Array<{
      bodyAKey: string;
      bodyBKey: string;
      aspect: string;
      orb?: number;
      id?: string;
    }>;
    composite?: CompositeChart;
    chartA?: { label?: string | null; western?: Record<string, unknown> } | null;
    chartB?: { label?: string | null; western?: Record<string, unknown> } | null;
  } | null;
};

export default function JointReadingTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [data, setData] = useState<JointPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [jointFailure, setJointFailure] = useState<string | null>(null);
  const [jointFailureCode, setJointFailureCode] = useState<string | null>(null);
  const [jointRetrySessionId, setJointRetrySessionId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("jointError");
    const failureCode = params.get("jointErrorCode");
    const retrySessionId = params.get("jointSessionId");
    if (failure) {
      setJointFailure(failure);
      setJointFailureCode(failureCode);
      setJointRetrySessionId(retrySessionId || null);
      const url = new URL(window.location.href);
      url.searchParams.delete("jointError");
      url.searchParams.delete("jointErrorCode");
      url.searchParams.delete("jointSessionId");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/joint-reading/${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError("Приглашение не найдено или истекло.");
        setData(null);
        return;
      }
      setData((await res.json()) as JointPayload);
      setError(null);
    } catch {
      setError("Не удалось загрузить приглашение.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    // Keep polling (partner status, then combined synthesis) until the joint
    // reading is fully done or the invite expired — not just while waiting on
    // the LLM synthesis, so the initiator also sees the partner's progress live.
    const shouldPoll = data.status !== "expired" && !data.combinedReading;
    if (!shouldPoll) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [data, load]);

  useEffect(() => {
    if (!token || !data?.combinedJobId || data.combinedReading) return;
    let cancelled = false;
    const storageKey = `aura:joint-combined-job:${token}`;
    void (async () => {
      try {
        const { waitForAsyncJob } = await import("@/lib/client/wait-for-async-job");
        await waitForAsyncJob({
          jobId: data.combinedJobId!,
          storageKey,
        });
      } catch {
        /* GET polling below still covers completion */
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [token, data?.combinedJobId, data?.combinedReading, load]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `/joint-reading/${token}`;
    return `${window.location.origin}/joint-reading/${encodeURIComponent(token)}`;
  }, [token]);

  const startReading = (role: "initiator" | "partner") => {
    if (!data) return;
    setJointReadingToken(token);
    setJointReadingRole(role);
    setJointReadingIntentSlug(data.intentSlug);
    router.push(
      withAppShellIfNeeded(
        buildJointSpreadStartPath({
          token,
          role,
          intentSlug: data.intentSlug,
          spreadId: data.spreadId,
          initiatorName: data.initiatorName,
          partnerName: data.partnerName,
        })
      )
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const jointReturn = resolveRegistrationReturnTo({ jointToken: token });
  const loginHref = buildLoginHref(jointReturn);
  const registerHref = buildRegisterHref(jointReturn);

  const retryAttach = async () => {
    if (!jointRetrySessionId || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/joint-reading/${encodeURIComponent(token)}/reattach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId: jointRetrySessionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setJointFailure(body.error || "Не удалось повторить привязку. Попробуйте пройти расклад ещё раз.");
        return;
      }
      setJointFailure(null);
      setJointRetrySessionId(null);
      await load();
    } catch {
      setJointFailure("Не удалось повторить привязку. Попробуйте пройти расклад ещё раз.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <SeoPageShell backHref="/joint-reading" backLabel="Совместные расклады">
        <div className="py-8 text-center">
          <p className="text-red-300">{error ?? "Ошибка"}</p>
        </div>
      </SeoPageShell>
    );
  }

  const labelA = data.initiatorName?.trim() || "Инициатор";
  const labelB = data.partnerName?.trim() || "Партнёр";
  const bothDone = data.hasInitiatorReading && data.hasPartnerReading;
  const spreadLabel = getSpread(data.spreadId).label;
  const themeTitle = getSpreadIntentBySlug(data.intentSlug)?.title ?? spreadLabel;
  const isExpired = data.status === "expired";

  return (
    <SeoPageShell backHref="/joint-reading" backLabel="Все совместные расклады" wide>
      <div className="joint-result ym-hide-content ym-disable-keys">
      <header className="joint-result__hero">
        <span className="joint-eyebrow"><Users size={14} aria-hidden="true" /> Совместный расклад · {themeTitle}</span>
        <h1>{labelA} и {labelB}</h1>
        <p>
          Каждый проходит свой расклад по схеме «{spreadLabel}» ({getSpread(data.spreadId).cardCount} карт).
          {data.combinedReading ? " Общая интерпретация уже готова." : " Общая интерпретация появится после завершения обоих этапов."}
        </p>
      </header>
      <p className="joint-result__cost">
        {bothDone
          ? "Оба личных расклада сохранены. Общая интерпретация собирается из двух результатов."
          : data.hasInitiatorReading || data.hasPartnerReading
            ? "Готовая личная часть сохранена. Второй участник увидит стоимость своего расклада до подтверждения."
            : "Приглашение и личные расклады оплачиваются отдельно; точная стоимость каждого шага показана до подтверждения."}
      </p>

      <ol className="joint-result__stages" aria-label="Этапы совместного расклада">
        <li className="joint-result__stage--done"><span>01</span> Приглашение <span className="sr-only">— завершено</span></li>
        <li className={bothDone ? "joint-result__stage--done" : ""}><span>02</span> Личные расклады <span className="sr-only">— {bothDone ? "завершено" : "ожидается"}</span></li>
        <li className={data.combinedReading ? "joint-result__stage--done" : ""}><span>03</span> Общий результат <span className="sr-only">— {data.combinedReading ? "завершено" : "ожидается"}</span></li>
      </ol>

      {jointFailure ? (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          <p>{jointFailure}</p>
          <p className="mt-1 text-xs text-red-200/70">
            {jointFailureCode === "joint_attach_unknown"
              ? "Статус сохранения пока не подтверждён. Проверьте, появился ли ваш личный расклад на этой странице. Если нет — обратитесь в поддержку перед повторной оплатой."
              : jointRetrySessionId
              ? "Личный расклад сохранён в кабинете. Можно попробовать привязать его без повторного прохождения."
              : "Личный расклад не завершён. Попробуйте пройти его по этой ссылке ещё раз."}
          </p>
          {jointFailureCode === "joint_attach_unknown" ? (
            <Link href="/cabinet/support" className="mt-3 inline-block text-aura-gold underline underline-offset-2">
              Написать в поддержку
            </Link>
          ) : null}
          {jointRetrySessionId ? (
            <button
              type="button"
              onClick={() => void retryAttach()}
              disabled={retrying}
              className="btn-luxe btn-luxe--sm btn-luxe--gold mt-3 disabled:opacity-60"
            >
              {retrying ? "Повторяем…" : "Повторить привязку"}
            </button>
          ) : null}
        </div>
      ) : null}

      {isExpired ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p>
            Срок действия этого приглашения истёк {new Date(data.expiresAt).toLocaleDateString("ru-RU")}.
          </p>
          {data.viewerRole === "initiator" ? (
            <>
              <p className="mt-1 text-xs text-amber-100/70">
                Создайте новое приглашение. Актуальную стоимость увидите в форме перед подтверждением.
              </p>
              <Link href="/joint-reading#joint-invite" className="btn-luxe btn-luxe--sm btn-luxe--gold mt-3">
                Создать новое приглашение
              </Link>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-100/70">
              Попросите {labelA} создать новое приглашение и отправить вам свежую ссылку.
            </p>
          )}
        </div>
      ) : null}

      <div className="joint-result__participants">
        <div>
          <span className="joint-eyebrow">Первый участник</span>
          <strong>{labelA}</strong>
          <span>{data.hasInitiatorReading ? "✓ Расклад готов" : "Ожидает расклад"}</span>
        </div>
        <div>
          <span className="joint-eyebrow">Второй участник</span>
          <strong>{labelB}</strong>
          <span>{data.hasPartnerReading ? "✓ Расклад готов" : "Ожидает расклад"}</span>
        </div>
      </div>

      {data.viewerRole === "initiator" && data.hasInitiatorReading && !data.hasPartnerReading && !isExpired ? (
        <div className="joint-result__handoff">
          <div>
            <span className="joint-eyebrow">Теперь ход партнёра</span>
            <p>Ваш личный расклад сохранён. Отправьте ссылку второму участнику: общий вывод появится после его расклада.</p>
          </div>
          <button type="button" onClick={() => void copyLink()} className="btn-luxe btn-luxe--sm btn-luxe--gold">
            <Copy className="h-4 w-4" /> {copied ? "Скопировано" : "Копировать приглашение"}
          </button>
        </div>
      ) : null}

      {!data.combinedReading &&
      data.hasInitiatorReading &&
      data.hasPartnerReading ? (
        <div
          role="status"
          className="mt-8 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-50/90"
        >
          <p className="font-medium text-amber-100">
            {data.combinedPending
              ? "Собираем общую интерпретацию"
              : "Оба расклада готовы — готовим общий синтез"}
          </p>
          <p className="mt-1 text-amber-50/70">
            Можно закрыть страницу — результат сохранится. Страница обновится
            автоматически.
          </p>
        </div>
      ) : null}

      {data.combinedReading ? (
        <article id="joint-result-report" className="joint-result__paper scroll-mt-24">
          <div className="joint-result__paper-heading">
            <div>
              <span className="joint-eyebrow">Результат для двоих</span>
              <h2>Общая интерпретация</h2>
            </div>
            <div className="joint-result__paper-actions">
              <ShareButton
              payload={jointReadingToSharePayload({
                token,
                initiatorName: data.initiatorName,
                partnerName: data.partnerName,
                combinedReading: data.combinedReading,
                intentSlug: data.intentSlug,
              })}
              variant="pill"
              label="Поделиться"
              className="joint-result__share"
            />
              <Link href={`/joint-reading/${encodeURIComponent(token)}/print`}>Печатная версия / PDF</Link>
            </div>
          </div>

          <div className="joint-result__reading">
            <PremiumReadingBody content={data.combinedReading} variant="print" />
          </div>

          {data.synastry?.chartA?.western && data.synastry?.chartB?.western ? (
            <div className="joint-result__visuals">
              {typeof data.synastry.overallScore === "number" ? (
                <p className="text-center text-xs font-medium uppercase tracking-wide text-amber-200/70">
                  Индекс {data.synastry.overallScore}/100
                </p>
              ) : null}
              <div className="grid items-stretch gap-6 lg:grid-cols-2">
                <NatalSynastryWheel
                  chartA={data.synastry.chartA.western}
                  chartB={data.synastry.chartB.western}
                  crossAspects={data.synastry.crossAspects}
                  labelA={data.synastry.chartA.label ?? labelA}
                  labelB={data.synastry.chartB.label ?? labelB}
                />
                {data.synastry.composite ? <CompositeWheel composite={data.synastry.composite} /> : null}
              </div>
              {data.synastry.highlights?.length ? (
                <ul className="space-y-1 text-xs text-white/60">
                  {data.synastry.highlights.slice(0, 4).map((h) => (
                    <li key={h}>· {h}</li>
                  ))}
                </ul>
              ) : null}
              {data.synastry.dimensions?.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.synastry.dimensions.map((dimension) => (
                    <article key={dimension.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-white/70">{dimension.label}</span>
                        <span className="text-amber-100/70">{dimension.band} · {dimension.index}/100</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-[11px] text-white/40">
                        {dimension.supportingAspectIds.map((id) => {
                          const aspect = data.synastry?.crossAspects?.find((item) => item.id === id);
                          return aspect ? <li key={id}>{aspect.bodyAKey} — {aspect.aspect} — {aspect.bodyBKey}; орб {aspect.orb}°</li> : null;
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : bothDone ? (
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Собираем общую интерпретацию…
        </p>
      ) : null}

      {(data.initiatorReading && data.viewerRole === "initiator") ||
      (data.partnerReading && data.viewerRole === "partner") ? (
        <section className="joint-result__personal" aria-labelledby="joint-personal-title">
          <span className="joint-eyebrow">Личная часть</span>
          <h2 id="joint-personal-title">Ваш личный расклад</h2>
          {data.initiatorReading && data.viewerRole === "initiator" ? (
            <details>
              <summary>Расклад — {labelA} <span>{getSpread(data.spreadId).cardCount} карт</span></summary>
              <JointPersonalReading content={data.initiatorReading} cards={data.initiatorCards ?? []} complete={bothDone} />
            </details>
          ) : null}
          {data.partnerReading && data.viewerRole === "partner" ? (
            <details>
              <summary>Расклад — {labelB} <span>{getSpread(data.spreadId).cardCount} карт</span></summary>
              <JointPersonalReading content={data.partnerReading} cards={data.partnerCards ?? []} complete={bothDone} />
            </details>
          ) : null}
        </section>
      ) : null}

      {!data.isLoggedIn ? (
        <div className="joint-result__next text-sm text-white/70">
          <Link href={loginHref} className="text-aura-gold hover:underline">
            Войдите
          </Link>
          {" или "}
          <Link
            href={registerHref}
            onClick={() => trackRegistrationCtaClick("joint_reading")}
            className="text-aura-gold hover:underline"
          >
            создайте аккаунт
          </Link>
          , чтобы пройти расклад по приглашению. После входа вы вернётесь на эту страницу.
        </div>
      ) : (
        <div className="joint-result__next space-y-4">
          {data.canStartAsInitiator && jointFailureCode !== "joint_attach_unknown" ? (
            <p className="text-sm text-white/60">
              Нажмите «Пройти мой расклад» — откроется схема «{spreadLabel}». После интерпретации
              вы вернётесь сюда.
            </p>
          ) : null}
          {data.canStartAsPartner && jointFailureCode !== "joint_attach_unknown" ? (
            <p className="text-sm text-white/60">
              Вы проходите расклад как партнёр ({labelB}). Имя инициатора ({labelA}) подставится в
              форму автоматически. Войдите под своим аккаунтом — имя в профиле может отличаться от
              подписи в приглашении.
            </p>
          ) : null}
          {data.isLoggedIn &&
          data.viewerRole === "initiator" &&
          !data.hasPartnerReading &&
          !data.canStartAsInitiator &&
          !isExpired ? (
            <p className="text-sm text-amber-200/80">Второй участник проходит расклад со своего аккаунта.</p>
          ) : null}
          {data.viewerRole === "guest" && !data.canStartAsPartner && !bothDone && !isExpired ? (
            <p className="text-sm text-amber-200/80">
              Слот партнёра уже занят другим аккаунтом. Попросите инициатора создать новое
              приглашение.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {data.canStartAsInitiator && jointFailureCode !== "joint_attach_unknown" ? (
              <button
                type="button"
                onClick={() => startReading("initiator")}
                className="btn-luxe btn-luxe--md btn-luxe--gold"
              >
                Пройти мой расклад
              </button>
            ) : null}
            {data.canStartAsPartner && jointFailureCode !== "joint_attach_unknown" ? (
              <button
                type="button"
                onClick={() => startReading("partner")}
                className="btn-luxe btn-luxe--md btn-luxe--gold"
              >
                Пройти расклад партнёра
              </button>
            ) : null}
          </div>
        </div>
      )}

      {!isExpired && !data.combinedReading ? (
        <p className="mt-8 text-center text-xs text-white/35">
          Ссылка действует до {new Date(data.expiresAt).toLocaleDateString("ru-RU")}
        </p>
      ) : null}

      {data.isLoggedIn &&
      (data.viewerRole === "initiator" || data.viewerRole === "partner") ? (
        <div className="joint-result__delete">
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              void (async () => {
                const who = `${labelA} и ${labelB}`;
                if (
                  !window.confirm(
                    `Удалить совместный расклад (${who}) безвозвратно?\nПропадёт из кабинета у обоих участников, ссылка перестанет открываться. Руны не возвращаются.`
                  )
                ) {
                  return;
                }
                setDeleting(true);
                try {
                  const res = await fetch(
                    `/api/joint-reading/${encodeURIComponent(token)}`,
                    { method: "DELETE", credentials: "include" }
                  );
                  if (!res.ok) {
                    window.alert("Не удалось удалить расклад. Попробуйте ещё раз.");
                    return;
                  }
                  router.replace("/cabinet?tab=history");
                } catch {
                  window.alert("Не удалось удалить расклад. Проверьте соединение.");
                } finally {
                  setDeleting(false);
                }
              })();
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/20 px-3 text-xs text-rose-200/75 transition hover:border-rose-300/40 hover:text-rose-100 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {deleting ? "Удаление…" : "Удалить из кабинета"}
          </button>
        </div>
      ) : null}
      </div>
    </SeoPageShell>
  );
}

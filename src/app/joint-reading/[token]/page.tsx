"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Loader2, Users } from "lucide-react";
import {
  setJointReadingToken,
  setJointReadingRole,
  setJointReadingIntentSlug,
} from "@/lib/joint-reading-storage";
import { buildJointSpreadStartPath } from "@/lib/joint-reading-nav";
import { withAppShellIfNeeded } from "@/lib/post-auth-return";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { getSpread } from "@/lib/spreads";
import { estimateJointSpreadCostPerPerson } from "@/lib/joint-reading-pricing";
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
  initiatorReading: string | null;
  partnerReading: string | null;
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
  const [jointRetrySessionId, setJointRetrySessionId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("jointError");
    const retrySessionId = params.get("jointSessionId");
    if (failure) {
      setJointFailure(failure);
      setJointRetrySessionId(retrySessionId || null);
      const url = new URL(window.location.href);
      url.searchParams.delete("jointError");
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

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `/joint-reading/${token}`;
    return `${window.location.origin}/joint-reading/${encodeURIComponent(token)}`;
  }, [token]);

  const spreadCost = useMemo(() => {
    if (!data) return null;
    return estimateJointSpreadCostPerPerson(undefined, data.spreadId);
  }, [data]);

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

  const createNewInvite = async () => {
    if (!data || creatingNew) return;
    setCreatingNew(true);
    try {
      const res = await fetch("/api/joint-reading/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          initiatorName: data.initiatorName ?? undefined,
          partnerName: data.partnerName ?? undefined,
          spreadId: data.spreadId,
          intentSlug: data.intentSlug,
          forceNew: true,
        }),
      });
      if (!res.ok) {
        setCreatingNew(false);
        return;
      }
      const created = (await res.json()) as { token: string };
      router.push(`/joint-reading/${encodeURIComponent(created.token)}`);
    } catch {
      setCreatingNew(false);
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
    <SeoPageShell backHref="/joint-reading" backLabel="Совместные расклады">
      <div className="flex items-center gap-2 text-aura-gold">
        <Users className="h-5 w-5" />
        <h1 className="font-display text-2xl text-white">{themeTitle}</h1>
      </div>
      <p className="mt-2 text-sm text-white/55">
        {labelA} и {labelB} — каждый проходит свой расклад («{spreadLabel}», {getSpread(data.spreadId).cardCount} карт),
        затем вы получаете общую интерпретацию.
      </p>
      {spreadCost ? (
        <p className="mt-2 text-xs text-white/40">
          Каждый участник оплачивает свой расклад отдельно (~{spreadCost} ᚢ). Приглашение для
          инициатора — 25 ᚢ.
        </p>
      ) : null}

      {jointFailure ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          <p>{jointFailure}</p>
          <p className="mt-1 text-xs text-red-200/70">
            Ваш личный расклад сохранён в кабинете, но в совместный расклад он не попал.
            {jointRetrySessionId
              ? " Можно попробовать привязать уже готовый расклад без повторного прохождения."
              : " Попробуйте пройти расклад по этой ссылке ещё раз."}
          </p>
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
                Создайте новое приглашение — имена {labelA} и {labelB} перенесутся автоматически.
              </p>
              <button
                type="button"
                onClick={() => void createNewInvite()}
                disabled={creatingNew}
                className="btn-luxe btn-luxe--sm btn-luxe--gold mt-3 disabled:opacity-60"
              >
                {creatingNew ? "Создаём…" : "Создать новое приглашение"}
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-100/70">
              Попросите {labelA} создать новое приглашение и отправить вам свежую ссылку.
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-white">{labelA}</p>
          <p className="mt-1 text-xs text-white/45">
            {data.hasInitiatorReading ? "✓ Расклад готов" : "Ожидает расклад"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-white">{labelB}</p>
          <p className="mt-1 text-xs text-white/45">
            {data.hasPartnerReading ? "✓ Расклад готов" : "Ожидает расклад"}
          </p>
        </div>
      </div>

      {data.initiatorReading && (data.viewerRole === "initiator" || data.status === "completed") ? (
        <article className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-display text-base text-white">Расклад — {labelA}</h2>
          <div className="mt-3">
            <PremiumReadingBody content={data.initiatorReading} className="text-sm text-white/75" />
          </div>
        </article>
      ) : null}

      {data.partnerReading && (data.viewerRole === "partner" || data.status === "completed") ? (
        <article className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-display text-base text-white">Расклад — {labelB}</h2>
          <div className="mt-3">
            <PremiumReadingBody content={data.partnerReading} className="text-sm text-white/75" />
          </div>
        </article>
      ) : null}

      {data.combinedReading ? (
        <article className="mt-8 rounded-2xl border border-aura-gold/20 bg-aura-gold/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg text-aura-gold">Общая интерпретация</h2>
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
            />
          </div>

          {data.synastry?.chartA?.western && data.synastry?.chartB?.western ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-center text-xs font-medium uppercase tracking-wide text-amber-200/70">
                Синастрия
                {typeof data.synastry.overallScore === "number"
                  ? ` · индекс ${data.synastry.overallScore}/100`
                  : ""}
              </p>
              <div className="mt-3">
                <NatalSynastryWheel
                  chartA={data.synastry.chartA.western}
                  chartB={data.synastry.chartB.western}
                  crossAspects={data.synastry.crossAspects}
                  labelA={data.synastry.chartA.label ?? labelA}
                  labelB={data.synastry.chartB.label ?? labelB}
                />
              </div>
              {data.synastry.highlights?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-white/60">
                  {data.synastry.highlights.slice(0, 4).map((h) => (
                    <li key={h}>· {h}</li>
                  ))}
                </ul>
              ) : null}
              {data.synastry.dimensions?.length ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
              {data.synastry.composite ? (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <h3 className="text-center text-sm font-medium text-amber-100">Композит отношений</h3>
                  <CompositeWheel composite={data.synastry.composite} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <PremiumReadingBody content={data.combinedReading} className="text-sm text-white/80" />
          </div>
          <Link href={`/joint-reading/${encodeURIComponent(token)}/print`} className="mt-5 inline-flex text-xs text-amber-200">
            Печатная версия / PDF
          </Link>
        </article>
      ) : bothDone ? (
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Собираем общую интерпретацию…
        </p>
      ) : null}

      {!data.isLoggedIn ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
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
        <div className="mt-8 space-y-4">
          {data.canStartAsInitiator ? (
            <p className="text-sm text-white/60">
              Нажмите «Пройти мой расклад» — откроется схема «{spreadLabel}». После интерпретации
              вы вернётесь сюда.
            </p>
          ) : null}
          {data.canStartAsPartner ? (
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
            <p className="text-sm text-amber-200/80">
              Это ваша ссылка как инициатора. Отправьте её партнёру ({labelB}) — со своего аккаунта
              пройти расклад партнёра нельзя.
            </p>
          ) : null}
          {data.viewerRole === "guest" && !data.canStartAsPartner && !bothDone && !isExpired ? (
            <p className="text-sm text-amber-200/80">
              Слот партнёра уже занят другим аккаунтом. Попросите инициатора создать новое
              приглашение.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {data.canStartAsInitiator ? (
              <button
                type="button"
                onClick={() => startReading("initiator")}
                className="btn-luxe btn-luxe--md btn-luxe--gold"
              >
                Пройти мой расклад
              </button>
            ) : null}
            {data.canStartAsPartner ? (
              <button
                type="button"
                onClick={() => startReading("partner")}
                className="btn-luxe btn-luxe--md btn-luxe--gold"
              >
                Пройти расклад партнёра
              </button>
            ) : null}
            {data.viewerRole === "initiator" &&
            data.hasInitiatorReading &&
            !data.hasPartnerReading &&
            !isExpired ? (
              <>
                <p className="w-full text-sm text-white/50">
                  Ждём партнёра — отправьте ему ссылку на эту страницу.
                </p>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="btn-luxe btn-luxe--sm border-aura-gold/30 bg-aura-gold/10 text-aura-gold"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Скопировано" : "Копировать ссылку"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {!isExpired ? (
        <p className="mt-8 text-center text-xs text-white/35">
          Ссылка действует до {new Date(data.expiresAt).toLocaleDateString("ru-RU")}
        </p>
      ) : null}
    </SeoPageShell>
  );
}

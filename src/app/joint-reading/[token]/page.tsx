"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Loader2, Users } from "lucide-react";
import {
  setJointReadingToken,
  setJointReadingRole,
} from "@/lib/joint-reading-storage";
import { toParagraphs } from "@/lib/format-paragraphs";
import { getSpread } from "@/lib/spreads";
import { estimateJointSpreadCostPerPerson } from "@/lib/joint-reading-pricing";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import ShareButton from "@/components/share/ShareButton";
import { jointReadingToSharePayload } from "@/lib/share/payload-builders";

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
    const qs = new URLSearchParams();
    qs.set("intent", data.intentSlug);
    qs.set("spread", data.spreadId);
    qs.set("joint", token);
    qs.set("jointRole", role);
    if (role === "partner" && data.initiatorName) {
      qs.set("jointInvite", data.initiatorName);
    }
    if (role === "initiator" && data.partnerName) {
      qs.set("jointPartnerName", data.partnerName);
    }
    router.push(`/?${qs.toString()}`);
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

  const loginHref = `/auth/user/login?returnTo=${encodeURIComponent(`/joint-reading/${token}`)}`;

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
  const isExpired = data.status === "expired";

  return (
    <SeoPageShell backHref="/joint-reading" backLabel="Совместные расклады">
      <div className="flex items-center gap-2 text-aura-gold">
        <Users className="h-5 w-5" />
        <h1 className="font-display text-2xl text-white">Совместный расклад</h1>
      </div>
      <p className="mt-2 text-sm text-white/55">
        {labelA} и {labelB} — каждый проходит свой расклад «{spreadLabel}», затем вы получаете
        общую интерпретацию.
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
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
            {toParagraphs(data.initiatorReading).map((p, i) => (
              <p key={`i-${i}`}>{p}</p>
            ))}
          </div>
        </article>
      ) : null}

      {data.partnerReading && (data.viewerRole === "partner" || data.status === "completed") ? (
        <article className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-display text-base text-white">Расклад — {labelB}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
            {toParagraphs(data.partnerReading).map((p, i) => (
              <p key={`p-${i}`}>{p}</p>
            ))}
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
              })}
              variant="pill"
              label="Поделиться"
            />
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
            {toParagraphs(data.combinedReading).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
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
              Вы проходите расклад как {labelB}. Имя инициатора ({labelA}) подставится в форму
              партнёра автоматически.
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

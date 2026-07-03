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
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("jointError");
    if (failure) {
      setJointFailure(failure);
      const url = new URL(window.location.href);
      url.searchParams.delete("jointError");
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
    const waitingCombined =
      data.hasInitiatorReading && data.hasPartnerReading && !data.combinedReading;
    if (!waitingCombined) {
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-red-300">{error ?? "Ошибка"}</p>
        <Link href="/joint-reading" className="mt-4 inline-block text-aura-gold hover:underline">
          ← К совместным раскладам
        </Link>
      </div>
    );
  }

  const labelA = data.initiatorName?.trim() || "Инициатор";
  const labelB = data.partnerName?.trim() || "Партнёр";
  const bothDone = data.hasInitiatorReading && data.hasPartnerReading;
  const spreadLabel = getSpread(data.spreadId).label;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
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
            Ваш личный расклад сохранён в кабинете, но в совместный расклад он не попал. Попробуйте
            пройти расклад по этой ссылке ещё раз.
          </p>
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
          <h2 className="font-display text-lg text-aura-gold">Общая интерпретация</h2>
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
          {data.viewerRole === "guest" && !data.canStartAsPartner && !bothDone ? (
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
                className="rounded-xl bg-aura-gold px-5 py-3 text-sm font-semibold text-[#1a1028] shadow-lg shadow-aura-gold/20 hover:bg-aura-gold/90"
              >
                Пройти мой расклад
              </button>
            ) : null}
            {data.canStartAsPartner ? (
              <button
                type="button"
                onClick={() => startReading("partner")}
                className="rounded-xl bg-aura-gold px-5 py-3 text-sm font-semibold text-[#1a1028] shadow-lg shadow-aura-gold/20 hover:bg-aura-gold/90"
              >
                Пройти расклад партнёра
              </button>
            ) : null}
            {data.viewerRole === "initiator" && data.hasInitiatorReading && !data.hasPartnerReading ? (
              <>
                <p className="w-full text-sm text-white/50">
                  Ждём партнёра — отправьте ему ссылку на эту страницу.
                </p>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-2 text-sm text-aura-gold"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Скопировано" : "Копировать ссылку"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-white/35">
        Ссылка действует до {new Date(data.expiresAt).toLocaleDateString("ru-RU")}
      </p>
    </div>
  );
}

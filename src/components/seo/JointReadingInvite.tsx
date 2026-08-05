"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, Loader2, Share2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { readStoredProfile } from "@/lib/home-flow-storage";
import {
  estimateJointSpreadCostPerPerson,
  JOINT_INVITE_RUNE_COST,
} from "@/lib/joint-reading-pricing";
import { buildJointSpreadStartPath } from "@/lib/joint-reading-nav";
import {
  setJointReadingIntentSlug,
  setJointReadingRole,
  setJointReadingToken,
} from "@/lib/joint-reading-storage";
import { withAppShellIfNeeded } from "@/lib/post-auth-return";
import { getSpread, normalizeSpreadId, type SpreadId } from "@/lib/spreads";

const SPREAD_OPTIONS: { id: SpreadId; label: string; hint: string }[] = [
  { id: "triplet-love", label: "Быстрый", hint: "3 карты" },
  { id: "love-7", label: "Глубокий", hint: "7 карт" },
  { id: "compatibility-12", label: "Максимальный", hint: "12 карт" },
];

const THEME_OPTIONS: { id: string; label: string; partnerLabel: string }[] = [
  { id: "sovmestimost-pary", label: "Пара", partnerLabel: "Имя партнёра" },
  { id: "sovmestimost-druzhba", label: "Дружба", partnerLabel: "Имя друга" },
  { id: "sovmestimost-biznes", label: "Бизнес", partnerLabel: "Имя партнёра по делу" },
];

export default function JointReadingInvite() {
  const { user, isLoggedIn, loading: authLoading } = useAuth();
  const prefilledRef = useRef(false);
  const [partnerName, setPartnerName] = useState("");
  const [initiatorName, setInitiatorName] = useState("");
  const [spreadId, setSpreadId] = useState<SpreadId>("love-7");
  const [intentSlug, setIntentSlug] = useState<string>("sovmestimost-pary");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    intentSlug: string;
    spreadId: SpreadId;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configUpdated, setConfigUpdated] = useState(false);

  useEffect(() => {
    if (authLoading || prefilledRef.current) return;
    const fromProfile = user?.name?.trim() || readStoredProfile()?.name?.trim();
    if (fromProfile) {
      setInitiatorName((prev) => prev.trim() || fromProfile);
      prefilledRef.current = true;
    }
  }, [authLoading, isLoggedIn, user?.name]);

  const createInvite = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConfigUpdated(false);
    try {
      const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
      const { status: resStatus, data: raw } = await postWithAsyncJob({
        url: "/api/joint-reading/create",
        storageKey: "aura:joint-reading-active-job",
        body: {
          initiatorName: initiatorName.trim() || undefined,
          partnerName: partnerName.trim() || undefined,
          spreadId,
          intentSlug,
        },
      });
      const data = raw as {
        url?: string;
        token?: string;
        intentSlug?: string;
        spreadId?: string;
        error?: string;
        reused?: boolean;
        configUpdated?: boolean;
      };
      if (resStatus === 402) {
        setError("Недостаточно рун для совместного расклада.");
        return;
      }
      if (resStatus === 403 && data.error) {
        setError(data.error);
        return;
      }
      if (resStatus >= 400 || !data.url) {
        setError(
          data.error === "Unauthorized"
            ? "Войдите, чтобы создать приглашение."
            : "Не удалось создать ссылку."
        );
        return;
      }
      setInviteUrl(data.url);
      setConfigUpdated(Boolean(data.configUpdated));
      if (data.token && data.intentSlug && data.spreadId) {
        setCreatedInvite({
          token: data.token,
          intentSlug: data.intentSlug,
          spreadId: normalizeSpreadId(data.spreadId),
        });
        setSpreadId(normalizeSpreadId(data.spreadId));
      }
      if (data.reused) {
        setError(null);
      }
    } catch {
      setError("Не удалось создать ссылку.");
    } finally {
      setLoading(false);
    }
  }, [initiatorName, partnerName, spreadId, intentSlug]);

  const partnerLabel =
    THEME_OPTIONS.find((opt) => opt.id === intentSlug)?.partnerLabel ?? "Имя партнёра";

  const perPersonCost = useMemo(
    () => estimateJointSpreadCostPerPerson(undefined, spreadId),
    [spreadId]
  );

  const activeSpreadLabel = useMemo(() => {
    const spread = getSpread(spreadId);
    return `${spread.label} · ${spread.cardCount} карт`;
  }, [spreadId]);

  const copyLink = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteUrl]);

  const shareLink = useCallback(async () => {
    if (!inviteUrl) return;
    if (typeof navigator.share !== "function") {
      void copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "Совместный расклад Zovus",
        text: "Приглашаю на совместный расклад — открой ссылку и пройди свой расклад.",
        url: inviteUrl,
      });
    } catch {
      /* cancelled */
    }
  }, [copyLink, inviteUrl]);

  const startMySpreadHref = useMemo(() => {
    if (createdInvite) {
      return withAppShellIfNeeded(
        buildJointSpreadStartPath({
          token: createdInvite.token,
          role: "initiator",
          intentSlug: createdInvite.intentSlug,
          spreadId: createdInvite.spreadId,
          partnerName: partnerName.trim() || undefined,
        })
      );
    }
    // Fallback: parse token from invite URL so CTA never lands on status-only page.
    if (!inviteUrl) return null;
    try {
      const parsed = new URL(inviteUrl, typeof window !== "undefined" ? window.location.origin : "https://zovus.ru");
      const parts = parsed.pathname.split("/").filter(Boolean);
      const token = parts[parts.length - 1]?.trim();
      if (!token) return inviteUrl;
      return withAppShellIfNeeded(
        buildJointSpreadStartPath({
          token,
          role: "initiator",
          intentSlug,
          spreadId,
          partnerName: partnerName.trim() || undefined,
        })
      );
    } catch {
      return inviteUrl;
    }
  }, [createdInvite, inviteUrl, intentSlug, spreadId, partnerName]);

  const startMySpread = useCallback(() => {
    if (!startMySpreadHref) return;
    const token =
      createdInvite?.token ||
      (() => {
        try {
          const parsed = new URL(
            inviteUrl || startMySpreadHref,
            typeof window !== "undefined" ? window.location.origin : "https://zovus.ru"
          );
          const parts = parsed.pathname.split("/").filter(Boolean);
          return parts[parts.length - 1]?.trim() || "";
        } catch {
          return "";
        }
      })();
    if (token) {
      setJointReadingToken(token);
      setJointReadingRole("initiator");
      setJointReadingIntentSlug(createdInvite?.intentSlug || intentSlug);
    }
    window.location.assign(startMySpreadHref);
  }, [startMySpreadHref, createdInvite, inviteUrl, intentSlug]);

  return (
    <div id="joint-invite" className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-aura-gold">
        <Link2 className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-lg text-white">Гадать вместе — по ссылке</h2>
      </div>
      <p className="mt-2 text-sm text-white/60">
        Создайте приглашение ({JOINT_INVITE_RUNE_COST} ᚢ). Затем каждый проходит свой расклад (~
        {perPersonCost} ᚢ за человека) — вы оба получите общую интерпретацию, когда оба завершат.
      </p>

      {!inviteUrl ? (
        <>
          <p className="mt-4 text-xs uppercase tracking-wide text-white/35">Тема</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIntentSlug(opt.id)}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  intentSlug === opt.id
                    ? "border-aura-gold/50 bg-aura-gold/10 text-aura-gold"
                    : "border-white/10 bg-black/20 text-white/55 hover:border-white/20"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs uppercase tracking-wide text-white/35">Глубина</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPREAD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSpreadId(opt.id)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  spreadId === opt.id
                    ? "border-aura-gold/50 bg-aura-gold/10 text-aura-gold"
                    : "border-white/10 bg-black/20 text-white/55 hover:border-white/20"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-white/40">{opt.hint}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-white/45">
          Ваше имя
          <input
            type="text"
            value={initiatorName}
            onChange={(e) => setInitiatorName(e.target.value)}
            placeholder="Аня"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            maxLength={40}
          />
        </label>
        <label className="block text-xs text-white/45">
          {partnerLabel}
          <input
            type="text"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="Максим"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            maxLength={40}
          />
        </label>
      </div>

      {!inviteUrl ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void createInvite()}
          className="btn-luxe btn-luxe--md btn-luxe--gold mt-4"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Создать ссылку-приглашение
        </button>
      ) : (
        <>
          <p className="mt-4 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-white/50">
            {inviteUrl}
          </p>
          <p className="mt-3 text-sm text-aura-gold/90">Схема приглашения: {activeSpreadLabel}</p>
          {configUpdated ? (
            <p className="mt-2 text-xs text-white/50">
              Обновили глубину расклада в активном приглашении — оба участника пройдут именно эту схему.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-white/55">
            Сначала пройдите свой расклад, затем отправьте ссылку партнёру.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startMySpread}
              disabled={!startMySpreadHref}
              className="btn-luxe btn-luxe--md btn-luxe--gold disabled:opacity-50"
            >
              Пройти мой расклад
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="btn-luxe btn-luxe--sm border-aura-gold/30 bg-aura-gold/10 text-aura-gold"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              type="button"
              onClick={() => void shareLink()}
              className="btn-luxe btn-luxe--sm border-white/10 bg-white/5 text-white/70"
            >
              <Share2 className="h-4 w-4" />
              Поделиться
            </button>
          </div>
        </>
      )}

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

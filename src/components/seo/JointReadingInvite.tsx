"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Link2, Loader2, Share2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { readStoredProfile } from "@/lib/home-flow-storage";
import {
  estimateJointSpreadCostPerPerson,
  JOINT_INVITE_RUNE_COST,
} from "@/lib/joint-reading-pricing";

export default function JointReadingInvite() {
  const { user, isLoggedIn, loading: authLoading } = useAuth();
  const prefilledRef = useRef(false);
  const [partnerName, setPartnerName] = useState("");
  const [initiatorName, setInitiatorName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/joint-reading/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiatorName: initiatorName.trim() || undefined,
          partnerName: partnerName.trim() || undefined,
          spreadId: "love-7",
          intentSlug: "sovmestimost-pary",
        }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        reused?: boolean;
      };
      if (res.status === 402) {
        setError("Недостаточно рун для совместного расклада.");
        return;
      }
      if (!res.ok || !data.url) {
        setError(
          data.error === "Unauthorized"
            ? "Войдите, чтобы создать приглашение."
            : "Не удалось создать ссылку."
        );
        return;
      }
      setInviteUrl(data.url);
      if (data.reused) {
        setError(null);
      }
    } catch {
      setError("Не удалось создать ссылку.");
    } finally {
      setLoading(false);
    }
  }, [initiatorName, partnerName]);

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

  return (
    <div id="joint-invite" className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-aura-gold">
        <Link2 className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-lg text-white">Гадать вместе — по ссылке</h2>
      </div>
      <p className="mt-2 text-sm text-white/60">
        Создайте приглашение ({JOINT_INVITE_RUNE_COST} ᚢ). Затем каждый проходит свой расклад (~
        {estimateJointSpreadCostPerPerson(undefined, "love-7")} ᚢ за человека) — вы оба получите общую интерпретацию, когда оба завершат.
      </p>

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
          Имя партнёра
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
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-2.5 text-sm text-aura-gold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Создать ссылку-приглашение
        </button>
      ) : (
        <>
          <p className="mt-4 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-white/50">
            {inviteUrl}
          </p>
          <p className="mt-4 text-sm text-white/55">
            Сначала пройдите свой расклад, затем отправьте ссылку партнёру.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={inviteUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-aura-gold px-4 py-2.5 text-sm font-semibold text-[#1a1028]"
            >
              Пройти мой расклад
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-2 text-sm text-aura-gold"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              type="button"
              onClick={() => void shareLink()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70"
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

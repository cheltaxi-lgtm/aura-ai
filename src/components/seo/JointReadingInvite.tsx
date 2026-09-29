"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, Loader2, Share2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { estimateJointSpreadCostPerPerson } from "@/lib/joint-reading-pricing";
import { useRuneConfig } from "@/lib/useRuneConfig";
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

async function fetchJointPricing(): Promise<{ invite: number; base: number }> {
  const response = await fetch("/api/runes/config", { cache: "no-store" });
  if (!response.ok) throw new Error("pricing unavailable");
  const latest = (await response.json()) as { costs?: { JOINT_READING?: number; INTENTION_SPREAD?: number } };
  const invite = Number(latest.costs?.JOINT_READING);
  const base = Number(latest.costs?.INTENTION_SPREAD);
  if (!Number.isFinite(invite) || invite < 0 || !Number.isFinite(base) || base < 0) {
    throw new Error("pricing unavailable");
  }
  return { invite, base };
}

export default function JointReadingInvite() {
  const { user, isLoggedIn, loading: authLoading } = useAuth();
  const { config, fromServer } = useRuneConfig();
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
  const [priceOverride, setPriceOverride] = useState<{ invite: number; base: number } | null>(null);
  const inviteCost = priceOverride?.invite ?? config.costs.JOINT_READING;
  const baseCost = priceOverride?.base ?? config.costs.INTENTION_SPREAD;

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
      if (!fromServer) {
        setError("Не удалось проверить стоимость. Обновите страницу и попробуйте снова.");
        return;
      }
      const latest = await fetchJointPricing();
      if (latest.invite !== inviteCost || latest.base !== baseCost) {
        setPriceOverride(latest);
        setError("Стоимость обновилась. Проверьте её и нажмите кнопку ещё раз.");
        return;
      }
      const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
      const { status: resStatus, data: raw } = await postWithAsyncJob({
        url: "/api/joint-reading/create",
        storageKey: "aura:joint-reading-active-job",
        body: {
          initiatorName: initiatorName.trim() || undefined,
          partnerName: partnerName.trim() || undefined,
          spreadId,
          intentSlug,
          confirmedCost: inviteCost,
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
        actualCost?: number;
      };
      if (resStatus === 409) {
        if (typeof data.actualCost === "number") {
          setPriceOverride({ invite: data.actualCost, base: latest.base });
        }
        setError("Стоимость обновилась. Проверьте её и нажмите кнопку ещё раз.");
        return;
      }
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
      window.dispatchEvent(new Event("joint-reading:created"));
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
      try {
        const latest = await fetchJointPricing();
        if (latest.invite !== inviteCost || latest.base !== baseCost) {
          setPriceOverride(latest);
          setError("Стоимость обновилась. Проверьте её и нажмите кнопку ещё раз.");
        } else {
          setError("Не удалось создать ссылку. Попробуйте снова.");
        }
      } catch {
        setError("Не удалось проверить стоимость. Обновите страницу и попробуйте снова.");
      }
    } finally {
      setLoading(false);
    }
  }, [initiatorName, partnerName, spreadId, intentSlug, fromServer, inviteCost, baseCost]);

  const partnerLabel =
    THEME_OPTIONS.find((opt) => opt.id === intentSlug)?.partnerLabel ?? "Имя партнёра";

  const perPersonCost = useMemo(
    () => estimateJointSpreadCostPerPerson(baseCost, spreadId),
    [baseCost, spreadId]
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
    <section id="joint-invite" className="joint-invite scroll-mt-24" aria-labelledby="joint-invite-title">
      <div className="joint-invite__heading">
        <span className="joint-eyebrow">{inviteUrl ? "Следующий шаг" : "Новый совместный расклад"}</span>
        <h2 id="joint-invite-title">{inviteUrl ? "Приглашение готово" : "Создать приглашение"}</h2>
        <p>{inviteUrl
          ? "Пройдите свой расклад, затем отправьте эту ссылку второму участнику."
          : "Выберите тему и глубину. Стоимость каждого шага видна до создания ссылки."}</p>
      </div>

      {!inviteUrl ? (
        <>
          <p className="joint-invite__label">Тема вашей связи</p>
          <div className="joint-invite__choices" role="group" aria-label="Тема совместного расклада">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIntentSlug(opt.id)}
                aria-pressed={intentSlug === opt.id}
                className={`joint-invite__choice ${intentSlug === opt.id ? "joint-invite__choice--selected" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="joint-invite__label">Глубина расклада</p>
          <div className="joint-invite__choices joint-invite__choices--depth" role="group" aria-label="Глубина совместного расклада">
            {SPREAD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSpreadId(opt.id)}
                aria-pressed={spreadId === opt.id}
                className={`joint-invite__choice joint-invite__choice--depth ${spreadId === opt.id ? "joint-invite__choice--selected" : ""}`}
              >
                <span>{opt.label}</span>
                <small>{opt.hint}</small>
              </button>
            ))}
          </div>

          <p className="joint-invite__label">Имена для приглашения <span>необязательно</span></p>
          <div className="joint-invite__names">
            <label>
              Ваше имя
              <input type="text" value={initiatorName} onChange={(e) => setInitiatorName(e.target.value)}
                placeholder="Как к вам обращаться" maxLength={40} />
            </label>
            <label>
              {partnerLabel}
              <input type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Имя второго участника" maxLength={40} />
            </label>
          </div>

          <div className="joint-invite__pricing" aria-label="Стоимость совместного расклада">
            <p className="joint-invite__pricing-title">Стоимость по шагам</p>
            <div><span>Приглашение · оплачиваете вы сейчас</span><strong>{fromServer ? `${inviteCost} ᚢ` : "Проверяем…"}</strong></div>
            <div><span>Ваш расклад · позже</span><strong>{fromServer ? `≈ ${perPersonCost} ᚢ` : "Проверяем…"}</strong></div>
            <div><span>Расклад второго участника · оплачивает он</span><strong>{fromServer ? `≈ ${perPersonCost} ᚢ` : "Проверяем…"}</strong></div>
            <p>Итоговая цена личного расклада показывается перед его подтверждением.</p>
          </div>
          <button type="button" disabled={loading || !fromServer} onClick={() => void createInvite()}
            className="btn-luxe btn-luxe--md btn-luxe--gold joint-invite__submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {loading ? "Создаём приглашение…" : fromServer ? `Создать приглашение · ${inviteCost} ᚢ` : "Проверяем стоимость…"}
          </button>
          {!fromServer && <p className="joint-invite__fineprint">Если цена не загрузилась, обновите страницу.</p>}
          <p className="joint-invite__fineprint">Открытие уже созданной ссылки бесплатно. Создание нового приглашения оплачивается отдельно.</p>
        </>
      ) : (
        <div className="joint-invite__created">
          <p className="joint-invite__created-spread">Выбрана схема: {activeSpreadLabel}</p>
          {configUpdated ? (
            <p className="joint-invite__fineprint">
              Обновили глубину расклада в активном приглашении — оба участника пройдут именно эту схему.
            </p>
          ) : null}
          <div className="joint-invite__created-actions">
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
          <p className="joint-invite__link-label">Ссылка для второго участника</p>
          <p className="joint-invite__url">{inviteUrl}</p>
          <p className="joint-invite__fineprint">Ссылка действует 14 дней. После обоих раскладов общая интерпретация появится в истории.</p>
        </div>
      )}

      {error ? <p role="alert" className="joint-invite__error">{error}</p> : null}
    </section>
  );
}

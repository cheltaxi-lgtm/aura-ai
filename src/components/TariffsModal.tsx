"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import RunePrice from "@/components/RunePrice";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { PRICING } from "@/lib/config/pricing";
import type { RuneActionType } from "@/lib/rune-costs";

interface TariffsModalProps {
  open: boolean;
  onClose: () => void;
  onOpenPaywall?: () => void;
  isLoggedIn?: boolean;
}

const PAID_ACTIONS: RuneActionType[] = [
  "READING",
  "QUESTION",
  "INTENTION_SPREAD",
  "VISION_ANALYSIS",
  "DAILY_EXTENDED",
  "DESTINY_CARD",
  "JOINT_READING",
  "DAILY_AMULET",
  "FINAL_REPORT",
];

export default function TariffsModal({
  open,
  onClose,
  onOpenPaywall,
  isLoggedIn = false,
}: TariffsModalProps) {
  const { config, cost } = useRuneConfig();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const rubPerRune = config.rubPerRune;

  return (
    <BodyPortal active={open}>
      <div className="fixed inset-0 z-[7000] flex items-end justify-center sm:items-center">
        <button
          type="button"
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Закрыть"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tariffs-modal-title"
          className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0612] shadow-2xl sm:mx-4 sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/70">Zovus</p>
              <h2 id="tariffs-modal-title" className="font-display text-lg font-bold text-white">
                Тарифы
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="lux-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {config.enabled ? (
              <>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center">
                  <p className="text-sm text-white/80">
                    Курс:{" "}
                    <span className="font-semibold text-amber-200">
                      1 ᚢ = {rubPerRune} ₽
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    Цены в рублях округлены · точная сумма при оплате в магазине рун
                  </p>
                </div>

                <ul className="mt-5 space-y-2">
                  {PAID_ACTIONS.map((action) => (
                    <li
                      key={action}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {config.labels[action] ?? action}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-white/45">
                          {action === "INTENTION_SPREAD"
                            ? "Базовая цена; схема с большим числом карт может стоить дороже"
                            : action === "DAILY_EXTENDED"
                              ? "Раз в сутки · классический расклад (3 карты) остаётся бесплатным"
                              : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <RunePrice value={cost(action)} iconClassName="h-3.5 w-3.5" />
                        <p className="mt-0.5 text-[10px] text-white/40">
                          ~{Math.round(cost(action) * rubPerRune)} ₽
                        </p>
                      </div>
                    </li>
                  ))}
                  <li className="flex items-start justify-between gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3.5 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">Сеанс нумеролога</p>
                      <p className="mt-0.5 text-xs text-white/45">Расчёт и расшифровка у Эвелины</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <RunePrice value={PRICING.NUMEROLOGY_SESSION} iconClassName="h-3.5 w-3.5" />
                      <p className="mt-0.5 text-[10px] text-white/40">
                        ~{Math.round(PRICING.NUMEROLOGY_SESSION * rubPerRune)} ₽
                      </p>
                    </div>
                  </li>
                </ul>

                <div className="mt-5 rounded-2xl border border-emerald-500/15 bg-emerald-950/20 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/80">
                    Бесплатно
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-white/65">
                    <li>· Расклад на сутки — 3 карты (классический), раз в день</li>
                    <li>· Новый расклад из 3 карт — раз в сутки</li>
                    <li>
                      · Первые {config.freeQuestions} вопроса в каждом сеансе с мастером
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-white/60">
                Полный разбор — 199 ₽ · подписка Zovus+ — 590 ₽/мес
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 px-5 py-4">
            {isLoggedIn && onOpenPaywall ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPaywall();
                }}
                className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block w-full"
              >
                Пополнить баланс рун
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="btn-luxe btn-luxe--md btn-luxe--block w-full border border-white/15 text-white/80"
              >
                Понятно
              </button>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

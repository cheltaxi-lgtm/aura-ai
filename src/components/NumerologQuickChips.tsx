"use client";

import { useState } from "react";
import { parseBirthDate } from "@/lib/numerology/constants";

const ROW_ONE = [
  {
    id: "pythagoras",
    emoji: "🔢",
    label: "Квадрат Пифагора",
    message: "Разбери мой квадрат Пифагора",
  },
  {
    id: "personal_year",
    emoji: "📅",
    label: "Личный год",
    message: "Что меня ждёт в этом году?",
  },
  {
    id: "forecast",
    emoji: "🔮",
    label: "Прогноз 9 лет",
    message: "Покажи мой прогноз на 9 лет",
  },
  {
    id: "favorable_dates",
    emoji: "🍀",
    label: "Удачные даты",
    message: "Какие благоприятные даты для меня?",
  },
] as const;

const ROW_TWO = [
  {
    id: "karma",
    emoji: "⚖️",
    label: "Карма",
    message: "Разбери мою карму",
  },
  {
    id: "chaldean",
    emoji: "📜",
    label: "Халдейская",
    message: "Посчитай мои числа имени по халдейской системе",
  },
  {
    id: "compat",
    emoji: "💞",
    label: "Совместимость",
    form: "compat" as const,
  },
  {
    id: "phone",
    emoji: "📱",
    label: "Число телефона",
    form: "phone" as const,
  },
] as const;

interface NumerologQuickChipsProps {
  disabled?: boolean;
  onSend: (message: string) => void;
}

function ChipButton({
  emoji,
  label,
  active,
  disabled,
  onClick,
  className = "",
}: {
  emoji: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex min-h-[2.25rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple/60 disabled:pointer-events-none disabled:opacity-40 sm:min-h-[2.5rem] sm:w-full sm:px-2 ${
        active
          ? "border-aura-gold/50 bg-gradient-to-b from-aura-gold/15 to-indigo-950/80 shadow-[0_0_16px_rgba(212,175,55,0.12)]"
          : "border-white/[0.08] bg-gradient-to-b from-indigo-950/70 to-[#0a0814]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-aura-gold/35 hover:from-indigo-900/80 hover:shadow-[0_0_14px_rgba(212,175,55,0.08)]"
      } ${className}`}
    >
      <span className="text-sm leading-none opacity-90" aria-hidden>
        {emoji}
      </span>
      <span className="text-[11px] font-medium leading-tight text-aura-champagne/95 group-hover:text-aura-champagne sm:text-xs">
        {label}
      </span>
    </button>
  );
}

export default function NumerologQuickChips({
  disabled = false,
  onSend,
}: NumerologQuickChipsProps) {
  const [activeForm, setActiveForm] = useState<"compat" | "phone" | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [partnerDate, setPartnerDate] = useState("");
  const [partnerDateError, setPartnerDateError] = useState("");
  const [phoneValue, setPhoneValue] = useState("");

  const send = (message: string) => {
    if (disabled) return;
    onSend(message);
    setActiveForm(null);
    setPartnerName("");
    setPartnerDate("");
    setPhoneValue("");
  };

  const toggleForm = (form: "compat" | "phone") => {
    if (disabled) return;
    setPartnerDateError("");
    setActiveForm((prev) => (prev === form ? null : form));
  };

  const handlePartnerDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);

    if (value.length > 4) {
      value = `${value.slice(0, 2)}.${value.slice(2, 4)}.${value.slice(4)}`;
    } else if (value.length > 2) {
      value = `${value.slice(0, 2)}.${value.slice(2)}`;
    }

    setPartnerDate(value);
    if (partnerDateError) setPartnerDateError("");
  };

  const submitCompat = () => {
    const date = partnerDate.trim();
    if (!date) return;
    if (!parseBirthDate(date)) {
      setPartnerDateError("Некорректная дата. Формат: ДД.ММ.ГГГГ (например, 17.03.1993).");
      return;
    }
    setPartnerDateError("");
    const name = partnerName.trim() || "партнёр";
    send(`Совместимость с ${name}, дата рождения ${date}`);
  };

  const submitPhone = () => {
    const phone = phoneValue.trim();
    if (!phone) return;
    send(`Число телефона ${phone}`);
  };

  const stopEnterBubble = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const formPanelClass =
    "rounded-xl border border-aura-gold/20 bg-gradient-to-b from-indigo-950/60 to-black/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

  const inputClass =
    "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-aura-gold/45 focus:ring-1 focus:ring-aura-gold/20";

  return (
    <div
      className="mb-2 rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-[#141028]/90 to-[#0a0812]/95 p-2 shadow-[0_4px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(212,175,55,0.06)] sm:p-3"
      role="region"
      aria-label="Быстрые расчёты нумерологии"
    >
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-aura-gold/55">
        Расчёты Эвелины
      </p>

      {/* Mobile: single horizontally-scrollable row · Desktop: 4×2 grid */}
      <div
        className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0"
        role="toolbar"
        aria-label="Расчёты нумерологии"
      >
        {[...ROW_ONE, ...ROW_TWO].map((chip) =>
          "form" in chip ? (
            <ChipButton
              key={chip.id}
              emoji={chip.emoji}
              label={chip.label}
              active={activeForm === chip.form}
              disabled={disabled}
              onClick={() => toggleForm(chip.form)}
            />
          ) : (
            <ChipButton
              key={chip.id}
              emoji={chip.emoji}
              label={chip.label}
              disabled={disabled}
              onClick={() => send(chip.message)}
            />
          )
        )}
      </div>

      {activeForm === "compat" ? (
        <div className={`${formPanelClass} mt-2.5`} role="group" aria-label="Данные партнёра для совместимости">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-aura-gold/50">
            Данные партнёра
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs text-gray-400">
              Имя
              <input
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                onKeyDown={(e) => {
                  stopEnterBubble(e);
                  if (e.key === "Enter") submitCompat();
                }}
                placeholder="Иван"
                disabled={disabled}
                className={inputClass}
              />
            </label>
            <label className="flex-1 text-xs text-gray-400">
              Дата рождения
              <input
                type="text"
                value={partnerDate}
                onChange={handlePartnerDateChange}
                onKeyDown={(e) => {
                  stopEnterBubble(e);
                  if (e.key === "Enter") submitCompat();
                }}
                placeholder="ДД.ММ.ГГГГ"
                maxLength={10}
                disabled={disabled}
                inputMode="numeric"
                aria-invalid={Boolean(partnerDateError)}
                className={inputClass}
              />
            </label>
            {partnerDateError ? (
              <p role="alert" className="text-xs text-red-400 sm:col-span-2">
                {partnerDateError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={disabled || !partnerDate.trim()}
              onClick={submitCompat}
              className="shrink-0 rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2 text-xs font-semibold text-aura-gold transition-all hover:bg-aura-gold/20 disabled:opacity-40 sm:mb-0"
            >
              Отправить
            </button>
          </div>
        </div>
      ) : null}

      {activeForm === "phone" ? (
        <div className={`${formPanelClass} mt-2.5`} role="group" aria-label="Число телефона или объекта">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-aura-gold/50">
            Номер или название
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs text-gray-400">
              Телефон, авто, адрес или бренд
              <input
                type="text"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                onKeyDown={(e) => {
                  stopEnterBubble(e);
                  if (e.key === "Enter") submitPhone();
                }}
                placeholder="+7 999 123-45-67"
                disabled={disabled}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              disabled={disabled || !phoneValue.trim()}
              onClick={submitPhone}
              className="shrink-0 rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2 text-xs font-semibold text-aura-gold transition-all hover:bg-aura-gold/20 disabled:opacity-40"
            >
              Отправить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

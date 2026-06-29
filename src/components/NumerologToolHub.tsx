"use client";

import { useState } from "react";
import {
  NUMEROLOG_FORM_TOOLS,
  NUMEROLOG_PERIOD_TOOLS,
  NUMEROLOG_PROFILE_TOOLS,
  getNumerologTool,
  numerologToolCost,
  validateNumerologToolParams,
  type NumerologToolForm,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import { PRICING } from "@/lib/config/pricing";

interface NumerologToolHubProps {
  disabled?: boolean;
  questionCost?: number;
  spreadCost?: number;
  onInvokeTool: (toolId: NumerologToolId, params?: NumerologToolParams) => void;
  onOpenSpread?: () => void;
}

function ToolCard({
  emoji,
  label,
  description,
  cost,
  disabled,
  active,
  highlight,
  onClick,
}: {
  emoji: string;
  label: string;
  description?: string;
  cost: number;
  disabled?: boolean;
  active?: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple/60 disabled:pointer-events-none disabled:opacity-40 sm:min-h-[5rem] ${
        highlight
          ? "border-aura-gold/45 bg-gradient-to-br from-aura-gold/15 via-violet-950/50 to-indigo-950/80 shadow-[0_0_24px_rgba(212,175,55,0.12)]"
          : active
            ? "border-aura-gold/50 bg-gradient-to-b from-aura-gold/15 to-indigo-950/80 shadow-[0_0_16px_rgba(212,175,55,0.12)]"
            : "border-white/[0.08] bg-gradient-to-b from-indigo-950/70 to-[#0a0814]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-aura-gold/35 hover:from-indigo-900/80 hover:shadow-[0_0_14px_rgba(212,175,55,0.08)]"
      }`}
    >
      <div className="flex w-full items-start gap-2">
        <span className="text-lg leading-none opacity-90" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-semibold leading-tight text-aura-champagne sm:text-sm">
            {label}
          </span>
          {description ? (
            <span className="mt-0.5 block text-[10px] leading-snug text-gray-400 sm:text-[11px]">
              {description}
            </span>
          ) : null}
        </div>
      </div>
      <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-aura-gold/60">
        {cost} ᚢ
      </span>
    </button>
  );
}

export default function NumerologToolHub({
  disabled = false,
  questionCost = PRICING.QUESTION,
  spreadCost = PRICING.NUMEROLOGY_SESSION,
  onInvokeTool,
  onOpenSpread,
}: NumerologToolHubProps) {
  const [activeForm, setActiveForm] = useState<NumerologToolForm | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [partnerDate, setPartnerDate] = useState("");
  const [partnerDateError, setPartnerDateError] = useState("");
  const [phoneValue, setPhoneValue] = useState("");

  const invoke = (toolId: NumerologToolId, params?: NumerologToolParams) => {
    if (disabled) return;
    onInvokeTool(toolId, params);
    setActiveForm(null);
    setPartnerName("");
    setPartnerDate("");
    setPhoneValue("");
    setPartnerDateError("");
  };

  const toggleForm = (form: NumerologToolForm) => {
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
    const params = { partnerName, partnerDate };
    const error = validateNumerologToolParams("compatibility", params);
    if (error) {
      setPartnerDateError(error);
      return;
    }
    invoke("compatibility", params);
  };

  const submitPhone = () => {
    const params = { objectValue: phoneValue };
    const error = validateNumerologToolParams("object_number", params);
    if (error) return;
    invoke("object_number", params);
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

  const spreadTool = getNumerologTool("spread_three_numbers");

  return (
    <div
      className="mb-2 rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-[#141028]/90 to-[#0a0812]/95 p-2 shadow-[0_4px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(212,175,55,0.06)] sm:p-3"
      role="region"
      aria-label="Расчёты нумерологии"
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-aura-gold/55">
          Расчёты Эвелины
        </p>
        <span className="text-[10px] text-gray-500">от {questionCost} ᚢ</span>
      </div>

      <div className="mb-3">
        <ToolCard
          emoji={spreadTool.emoji}
          label={spreadTool.label}
          description={spreadTool.description}
          cost={spreadCost}
          disabled={disabled}
          highlight
          onClick={() => onOpenSpread?.()}
        />
      </div>

      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/50">
        По периоду
      </p>
      <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2" role="toolbar" aria-label="Расклад по периоду">
        {NUMEROLOG_PERIOD_TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            emoji={tool.emoji}
            label={tool.label}
            cost={numerologToolCost(tool.id)}
            disabled={disabled}
            onClick={() => invoke(tool.id)}
          />
        ))}
      </div>

      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/50">
        Профиль и судьба
      </p>
      <div
        className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2"
        role="toolbar"
        aria-label="Расчёты профиля"
      >
        {NUMEROLOG_PROFILE_TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            emoji={tool.emoji}
            label={tool.label}
            description={tool.description}
            cost={numerologToolCost(tool.id)}
            disabled={disabled}
            onClick={() => invoke(tool.id)}
          />
        ))}
      </div>

      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/50">
        Партнёр и объекты
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2" role="toolbar" aria-label="Расчёты с вводом данных">
        {NUMEROLOG_FORM_TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            emoji={tool.emoji}
            label={tool.label}
            description={tool.description}
            cost={numerologToolCost(tool.id)}
            disabled={disabled}
            active={activeForm === tool.needsForm}
            onClick={() => toggleForm(tool.needsForm!)}
          />
        ))}
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
              className="shrink-0 rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2 text-xs font-semibold text-aura-gold transition-all hover:bg-aura-gold/20 disabled:opacity-40"
            >
              Рассчитать · {numerologToolCost("compatibility")} ᚢ
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
              Рассчитать · {numerologToolCost("object_number")} ᚢ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

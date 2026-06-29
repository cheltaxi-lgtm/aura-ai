"use client";

import { useState } from "react";
import { parseBirthDate } from "@/lib/numerology/constants";
import {
  NUMEROLOG_SESSION_TOOLS,
  getNumerologTool,
  validateNumerologSessionReady,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import RuneCost from "@/components/RuneCost";

interface NumerologCalculationPickerProps {
  selectedId: NumerologToolId;
  params: NumerologToolParams;
  onSelect: (id: NumerologToolId) => void;
  onParamsChange: (params: NumerologToolParams) => void;
  runeBillingEnabled?: boolean;
  userBirthDate?: string;
}

export default function NumerologCalculationPicker({
  selectedId,
  params,
  onSelect,
  onParamsChange,
  runeBillingEnabled = false,
  userBirthDate,
}: NumerologCalculationPickerProps) {
  const [partnerDateError, setPartnerDateError] = useState("");
  const selected = getNumerologTool(selectedId);
  const sessionError = validateNumerologSessionReady(selectedId, params, userBirthDate);

  const handlePartnerDateChange = (value: string) => {
    let v = value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4)}`;
    else if (v.length > 2) v = `${v.slice(0, 2)}.${v.slice(2)}`;
    onParamsChange({ ...params, partnerDate: v });
    if (partnerDateError) setPartnerDateError("");
  };

  const inputClass =
    "mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-amber-400/45";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {NUMEROLOG_SESSION_TOOLS.map((tool) => {
          const active = tool.id === selectedId;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool.id)}
              className={`rounded-2xl border p-3 text-left transition-all ${
                active
                  ? "border-amber-400/50 bg-amber-950/25 shadow-lg shadow-amber-500/10"
                  : "border-white/10 bg-white/5 hover:border-amber-400/30 hover:bg-white/10"
              }`}
            >
              <span className="text-lg" aria-hidden>
                {tool.emoji}
              </span>
              <span className="mt-1 block text-sm font-semibold text-white">{tool.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
                {tool.drawCount}{" "}
                {tool.drawCount === 1 ? "число" : tool.drawCount < 5 ? "числа" : "чисел"}
              </span>
              {runeBillingEnabled ? (
                <RuneCost cost={tool.cost} enabled className="mt-1 text-[10px] text-amber-200/80" />
              ) : null}
            </button>
          );
        })}
      </div>

      {selected.needsForm === "compat" ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-xs uppercase tracking-widest text-amber-200/70">Данные партнёра</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-white/60">
              Имя
              <input
                type="text"
                value={params.partnerName ?? ""}
                onChange={(e) => onParamsChange({ ...params, partnerName: e.target.value })}
                placeholder="Иван"
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-white/60">
              Дата рождения
              <input
                type="text"
                value={params.partnerDate ?? ""}
                onChange={(e) => handlePartnerDateChange(e.target.value)}
                placeholder="ДД.ММ.ГГГГ"
                maxLength={10}
                inputMode="numeric"
                className={inputClass}
              />
            </label>
          </div>
          {partnerDateError ? (
            <p className="mt-2 text-xs text-red-300">{partnerDateError}</p>
          ) : null}
        </div>
      ) : null}

      {selected.needsForm === "phone" ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-xs uppercase tracking-widest text-amber-200/70">Объект расчёта</p>
          <label className="block text-xs text-white/60">
            Телефон, номер авто, адрес или название — Эвелина определит тип сама
            <input
              type="text"
              value={params.objectValue ?? ""}
              onChange={(e) => onParamsChange({ ...params, objectValue: e.target.value })}
              placeholder="+7 999 123-45-67, А123ВС, Кирова 18А…"
              className={inputClass}
            />
          </label>
        </div>
      ) : null}

      <p className="text-center text-xs text-white/50">
        {selected.description} · после выбора откроете {selected.drawCount}{" "}
        {selected.drawCount === 1 ? "число" : selected.drawCount < 5 ? "числа" : "чисел"}
      </p>
      {sessionError ? (
        <p className="text-center text-xs text-amber-200/90">{sessionError}</p>
      ) : null}
    </div>
  );
}

export function numerologCalculationReady(
  toolId: NumerologToolId,
  params: NumerologToolParams,
  birthDate?: string | null
): boolean {
  return validateNumerologSessionReady(toolId, params, birthDate) === null;
}

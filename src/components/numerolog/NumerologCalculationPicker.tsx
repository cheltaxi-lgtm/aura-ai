"use client";

import { useState } from "react";
import {
  NUMEROLOG_SESSION_TOOLS,
  getNumerologTool,
  validateNumerologSessionReady,
  type NumerologToolDef,
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
  /** Full name from profile — required for chaldean/karma. */
  userFullName?: string;
  /** Summary block is rendered in the modal footer — hide duplicate panel here. */
  hideSummaryPanel?: boolean;
}

function drawMeta(tool: NumerologToolDef): string {
  if (tool.drawCount === 0) return "психоматрица";
  if (tool.drawCount === 1) return "1 число";
  if (tool.drawCount < 5) return `${tool.drawCount} числа`;
  return `${tool.drawCount} чисел`;
}

function drawActionHint(tool: NumerologToolDef): string {
  if (tool.drawCount === 0) {
    return "Классический квадрат Пифагора по дате рождения — чистый расчёт, без случайности.";
  }
  return `После «Посчитать» числа рассчитаются из вашего кода и проявятся по позициям — не «вытягивание».`;
}

export default function NumerologCalculationPicker({
  selectedId,
  params,
  onSelect,
  onParamsChange,
  runeBillingEnabled = false,
  userBirthDate,
  userFullName,
  hideSummaryPanel = false,
}: NumerologCalculationPickerProps) {
  const [partnerDateError, setPartnerDateError] = useState("");
  const selected = getNumerologTool(selectedId);
  const sessionError = validateNumerologSessionReady(
    selectedId,
    params,
    userBirthDate,
    userFullName
  );

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
    <div className="numerolog-calc-picker space-y-4">
      <div className="numerolog-calc-picker__grid grid grid-cols-2 gap-2">
        {NUMEROLOG_SESSION_TOOLS.map((tool) => {
          const active = tool.id === selectedId;
          const tagline = tool.tagline ?? tool.description ?? "";

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool.id)}
              className={`numerolog-calc-picker__card group relative min-w-0 rounded-2xl border p-3 text-left transition-all duration-300 ${
                active
                  ? "border-aura-gold/55 bg-gradient-to-br from-amber-950/45 via-[#1a1228]/90 to-purple-950/35 shadow-[0_0_28px_rgba(201,153,58,0.14)]"
                  : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
              }`}
            >
              {active ? (
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aura-gold/70 to-transparent"
                  aria-hidden
                />
              ) : null}

              <div className="flex min-w-0 items-start gap-2">
                <span
                  className={`numerolog-calc-picker__emoji flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base transition-colors ${
                    active
                      ? "border-aura-gold/35 bg-amber-950/40"
                      : "border-white/10 bg-black/35 group-hover:border-white/20"
                  }`}
                  aria-hidden
                >
                  {tool.emoji}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-1">
                    <p className="numerolog-calc-picker__title min-w-0 flex-1 font-display font-semibold text-white">
                      {tool.label}
                    </p>
                    {active ? (
                      <span
                        className="shrink-0 text-[10px] font-medium text-aura-gold"
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>

                  {tagline ? (
                    <p className="numerolog-calc-picker__tagline mt-1 text-white/55">{tagline}</p>
                  ) : null}

                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/45">
                      {drawMeta(tool)}
                    </span>
                    {runeBillingEnabled ? (
                      <RuneCost cost={tool.cost} enabled className="text-[9px] text-amber-200/75" />
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!hideSummaryPanel ? (
        <div className="numerolog-calc-picker__summary rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-amber-950/25 via-black/20 to-transparent px-4 py-3.5">
          <p className="numerolog-calc-picker__summary-title font-medium text-aura-gold/80">
            {selected.label}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            {selected.description ?? selected.tagline ?? ""}
          </p>
          <p className="mt-2 text-xs text-white/45">{drawActionHint(selected)}</p>
        </div>
      ) : null}

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

      {sessionError ? (
        <p className="text-center text-xs text-amber-200/90">{sessionError}</p>
      ) : null}
    </div>
  );
}

export function numerologCalculationSummary(toolId: NumerologToolId) {
  const tool = getNumerologTool(toolId);
  return {
    label: tool.label,
    description: tool.description ?? tool.tagline ?? "",
    hint: drawActionHint(tool),
  };
}

export function numerologCalculationReady(
  toolId: NumerologToolId,
  params: NumerologToolParams,
  birthDate?: string | null,
  fullName?: string | null
): boolean {
  return validateNumerologSessionReady(toolId, params, birthDate, fullName) === null;
}

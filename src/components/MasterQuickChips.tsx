"use client";

import { getCharacterById } from "@/lib/characters";
import {
  MASTER_PERIOD_CHIP_MESSAGES,
  type MasterQuickChipMasterId,
} from "@/lib/master-quick-chips";

const PERIOD_CHIPS = [
  { id: "today" as const, emoji: "☀️", label: "Сегодня", message: MASTER_PERIOD_CHIP_MESSAGES.today },
  { id: "week" as const, emoji: "📆", label: "Неделя", message: MASTER_PERIOD_CHIP_MESSAGES.week },
  { id: "month" as const, emoji: "🗓️", label: "Месяц", message: MASTER_PERIOD_CHIP_MESSAGES.month },
];

interface MasterQuickChipsProps {
  masterId: MasterQuickChipMasterId;
  disabled?: boolean;
  onSend: (message: string) => void;
}

function ChipButton({
  emoji,
  label,
  disabled,
  onClick,
  className = "",
}: {
  emoji: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex min-h-[2.25rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-gold/50 disabled:pointer-events-none disabled:opacity-40 sm:min-h-[2.5rem] sm:w-full sm:px-2 border-white/[0.08] bg-[rgba(20,18,16,0.9)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-aura-gold/35 hover:bg-[rgba(26,22,18,0.95)] ${className}`}
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

export default function MasterQuickChips({
  masterId,
  disabled = false,
  onSend,
}: MasterQuickChipsProps) {
  const masterName = getCharacterById(masterId)?.name ?? "Мастер";

  const send = (message: string) => {
    if (disabled) return;
    onSend(message);
  };

  return (
    <div
      className="mb-2 rounded-2xl border border-aura-gold/15 bg-[#141210]/95 p-2 shadow-[0_4px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(212,175,55,0.06)] sm:p-3"
      role="region"
      aria-label={`Быстрые расклады — ${masterName}`}
    >
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-aura-gold/55">
        Расклады {masterName}
      </p>

      <div
        className="grid grid-cols-3 gap-1.5 sm:gap-2"
        role="toolbar"
        aria-label="Расклад по периоду"
      >
        {PERIOD_CHIPS.map((chip) => (
          <ChipButton
            key={chip.id}
            emoji={chip.emoji}
            label={chip.label}
            disabled={disabled}
            onClick={() => send(chip.message)}
          />
        ))}
      </div>
    </div>
  );
}
